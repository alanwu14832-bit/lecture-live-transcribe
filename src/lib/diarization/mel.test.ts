import { describe, expect, it } from "vitest";
import ref from "@/test/fixtures/mel_filters_librosa.json";
import { HOP, MelFrontend, N_FFT, N_MELS, melFilterBank, numFrames } from "./mel";

describe("melFilterBank", () => {
  it("與 librosa slaney 濾波器一致", () => {
    const fb = melFilterBank();
    const [rows, cols] = ref.shape;
    expect(rows).toBe(N_MELS);
    expect(cols).toBe(N_FFT / 2 + 1);
    let maxDiff = 0;
    for (let m = 0; m < rows; m++) for (let k = 0; k < cols; k++) maxDiff = Math.max(maxDiff, Math.abs(fb[m][k] - ref.data[m * cols + k]));
    expect(maxDiff).toBeLessThan(1e-6);
  });
});

describe("numFrames", () => {
  it("符合 HF 的公式：center 時 floor(L/hop)，否則 floor((L-n_fft)/hop)+1", () => {
    // 處理器定義的第一個 chunk（104 幀）與後續 chunk 的樣本數
    expect(numFrames((104 - 1) * HOP + 200, true)).toBe(104);
    expect(numFrames(104 * HOP + 400, false)).toBe(104);
    expect(numFrames(100, false)).toBe(0);
  });
});

describe("MelFrontend", () => {
  it("1 kHz 正弦波的能量集中在對應的 mel bin", () => {
    const sr = 16000;
    const n = sr;
    const audio = new Float32Array(n);
    for (let i = 0; i < n; i++) audio[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr);
    const { features, numFrames: f } = new MelFrontend().extract(audio, true);
    expect(f).toBe(100);
    const mid = 50;
    let best = -1;
    let bestVal = -Infinity;
    for (let m = 0; m < N_MELS; m++) {
      const v = features[mid * N_MELS + m];
      if (v > bestVal) {
        bestVal = v;
        best = m;
      }
    }
    // slaney 尺度下 1000 Hz 剛好是線性段結尾：mel(1000)=15，總共 128 bins 對到 mel(8000)≈45.2 → 約第 42 bin
    expect(best).toBeGreaterThan(36);
    expect(best).toBeLessThan(48);
    // 靜音的 log-mel 接近 log(2^-24)
    const silent = new MelFrontend().extract(new Float32Array(3200), true);
    expect(silent.features[0]).toBeCloseTo(Math.log(2 ** -24), 3);
  });

  it("串流切法：從幀中心往前 256 個樣本以 center=false 餵，結果與整段 center=true 逐幀相同", () => {
    const sr = 16000;
    const audio = new Float32Array(sr * 2);
    let seed = 7;
    for (let i = 0; i < audio.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      audio[i] = (seed / 0x7fffffff - 0.5) * 0.2 + 0.3 * Math.sin((2 * Math.PI * 440 * i) / sr);
    }
    const fe = new MelFrontend();
    const full = fe.extract(audio, true);
    const startFrame = 72;
    const chunkSamples = 104 * HOP + 400;
    const s0 = startFrame * HOP - N_FFT / 2;
    // 視窗前 56 個樣本權重為零，所以 chunk 第一個樣本少減的 preemphasis 不影響結果
    const chunk = fe.extract(audio.slice(s0, s0 + chunkSamples), false);
    expect(chunk.numFrames).toBe(104);
    let maxDiff = 0;
    for (let t = 0; t < 104; t++) {
      for (let m = 0; m < N_MELS; m++) {
        maxDiff = Math.max(maxDiff, Math.abs(chunk.features[t * N_MELS + m] - full.features[(startFrame + t) * N_MELS + m]));
      }
    }
    expect(maxDiff).toBeLessThan(1e-3);
  });
});
