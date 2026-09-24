/**
 * Nemotron 3 Diarization 的前處理：把 16 kHz 音訊轉成 128 維 log-mel 特徵。
 *
 * 對應 Hugging Face 的 NemotronAsrStreamingFeatureExtractor：
 * preemphasis 0.97 → torch.stft（n_fft 512、hop 160、對稱 Hann 400 補到 512）
 * → 功率頻譜 → librosa slaney mel（128 bins, 0–8000 Hz）→ log(mel + 2^-24)，不做正規化。
 *
 * 串流時第一個 chunk 用 center=true（兩側補 256 個零），之後的 chunk 用 center=false，
 * 只要音訊從「該幀中心往前 256 個樣本」開始餵，就能逐幀重現整段一次算出來的結果。
 */

export const SAMPLE_RATE = 16000;
export const N_FFT = 512;
export const HOP = 160;
export const WIN = 400;
export const N_MELS = 128;
export const PREEMPHASIS = 0.97;
const LOG_ZERO_GUARD = 2 ** -24;

/** slaney 的 Hz ↔ mel 轉換：1000 Hz 以下線性，以上對數 */
function hzToMel(hz: number) {
  const fSp = 200 / 3;
  const minLogHz = 1000;
  const minLogMel = minLogHz / fSp;
  const logStep = Math.log(6.4) / 27;
  return hz >= minLogHz ? minLogMel + Math.log(hz / minLogHz) / logStep : hz / fSp;
}

function melToHz(mel: number) {
  const fSp = 200 / 3;
  const minLogHz = 1000;
  const minLogMel = minLogHz / fSp;
  const logStep = Math.log(6.4) / 27;
  return mel >= minLogMel ? minLogHz * Math.exp(logStep * (mel - minLogMel)) : fSp * mel;
}

/** 等同 librosa.filters.mel(sr, n_fft, n_mels, fmin=0, fmax=sr/2, norm="slaney")，回傳 [n_mels][n_fft/2+1] */
export function melFilterBank(sr = SAMPLE_RATE, nFft = N_FFT, nMels = N_MELS): Float32Array[] {
  const nBins = nFft / 2 + 1;
  const fftFreqs = Array.from({ length: nBins }, (_, i) => (i * sr) / nFft);
  const melMin = hzToMel(0);
  const melMax = hzToMel(sr / 2);
  const melPts = Array.from({ length: nMels + 2 }, (_, i) => melToHz(melMin + ((melMax - melMin) * i) / (nMels + 1)));
  const filters: Float32Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const lower = melPts[m];
    const center = melPts[m + 1];
    const upper = melPts[m + 2];
    const norm = 2 / (upper - lower);
    const row = new Float32Array(nBins);
    for (let k = 0; k < nBins; k++) {
      const f = fftFreqs[k];
      const lo = (f - lower) / (center - lower);
      const hi = (upper - f) / (upper - center);
      row[k] = Math.max(0, Math.min(lo, hi)) * norm;
    }
    filters.push(row);
  }
  return filters;
}

/** 對稱 Hann（torch.hann_window periodic=False）補零到 n_fft，兩側各補 (n_fft - win) / 2 */
function paddedWindow(): Float32Array {
  const w = new Float32Array(N_FFT);
  const off = (N_FFT - WIN) / 2;
  for (let n = 0; n < WIN; n++) w[off + n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (WIN - 1));
  return w;
}

/** 就地 radix-2 複數 FFT，長度必須是 2 的次方 */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function preemphasize(audio: Float32Array): Float32Array {
  const out = new Float32Array(audio.length);
  if (audio.length === 0) return out;
  out[0] = audio[0];
  for (let i = 1; i < audio.length; i++) out[i] = audio[i] - PREEMPHASIS * audio[i - 1];
  return out;
}

/** center=true 時有效幀數 floor(L / hop)；center=false 時 floor((L - n_fft) / hop) + 1 */
export function numFrames(numSamples: number, center: boolean): number {
  return center ? Math.floor(numSamples / HOP) : Math.max(0, Math.floor((numSamples - N_FFT) / HOP) + 1);
}

export class MelFrontend {
  private readonly filters = melFilterBank();
  private readonly window = paddedWindow();
  private readonly re = new Float32Array(N_FFT);
  private readonly im = new Float32Array(N_FFT);
  private readonly power = new Float32Array(N_FFT / 2 + 1);

  /** 回傳 [numFrames][N_MELS] 攤平成一維（row-major），給 ONNX 當 input_features */
  extract(audio: Float32Array, center: boolean): { features: Float32Array; numFrames: number } {
    const x = preemphasize(audio);
    const frames = numFrames(x.length, center);
    const features = new Float32Array(frames * N_MELS);
    const padLeft = center ? N_FFT / 2 : 0;
    for (let t = 0; t < frames; t++) {
      const start = t * HOP - padLeft;
      for (let n = 0; n < N_FFT; n++) {
        const idx = start + n;
        this.re[n] = (idx >= 0 && idx < x.length ? x[idx] : 0) * this.window[n];
        this.im[n] = 0;
      }
      fft(this.re, this.im);
      for (let k = 0; k <= N_FFT / 2; k++) this.power[k] = this.re[k] * this.re[k] + this.im[k] * this.im[k];
      for (let m = 0; m < N_MELS; m++) {
        const row = this.filters[m];
        let acc = 0;
        for (let k = 0; k <= N_FFT / 2; k++) acc += row[k] * this.power[k];
        features[t * N_MELS + m] = Math.log(acc + LOG_ZERO_GUARD);
      }
    }
    return { features, numFrames: frames };
  }
}
