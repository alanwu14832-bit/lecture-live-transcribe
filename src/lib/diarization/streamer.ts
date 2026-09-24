/**
 * Nemotron 3 Diarization 的串流驅動器：切 chunk、算 mel、跑模型、更新講者快取、吐出每 10 ms 的講者機率。
 * 模型執行透過 ModelRunner 注入，所以同一份邏輯可以在瀏覽器 worker（onnxruntime-web）與 Node 測試（onnxruntime-node）跑。
 *
 * 使用 Hugging Face 處理器的 low_latency 模式：每個 chunk 9 個 encoder 幀 + 4 個 look-ahead 幀，
 * 一個 encoder 幀 = 8 個 mel 幀 = 80 ms，所以每步前進 0.72 秒、延遲約 1.04 秒。
 */
import { HOP, MelFrontend, N_FFT, N_MELS, numFrames } from "./mel";
import { NEMOTRON3_STREAMING_CONFIG, SpeakerCache, type SpeakerCacheConfig } from "./speaker-cache";

export interface ModelOutput {
  /** [(numCached + numChunkEncoderFrames) * 8][numSpeakers] */
  logits: Float32Array;
  /** [numChunkEncoderFrames][hidden] */
  chunkEmbeds: Float32Array;
  silenceEmbeds: Float32Array;
}

export type ModelRunner = (inputFeatures: Float32Array, numMelFrames: number, cachedEmbeds: Float32Array, numCached: number, maskLength: number) => Promise<ModelOutput>;

export interface StreamingMode {
  chunkLength: number;
  lookahead: number;
}

export const LOW_LATENCY: StreamingMode = { chunkLength: 9, lookahead: 4 };
export const VERY_LOW_LATENCY: StreamingMode = { chunkLength: 6, lookahead: 2 };

export interface ProbsChunk {
  /** 第一幀在整場的位置（10 ms 為單位） */
  startFrame: number;
  /** [numFrames][numSpeakers]，已經過 sigmoid */
  probs: Float32Array;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export class NemotronStreamer {
  private readonly mel = new MelFrontend();
  private readonly cache: SpeakerCache;
  private readonly cfg: SpeakerCacheConfig;
  private buffer: Float32Array = new Float32Array(0);
  /** 已經吐出結果的 mel 幀數 */
  private emittedMelFrames = 0;
  private busy = false;
  private pending: Float32Array[] = [];

  constructor(private readonly run: ModelRunner, private readonly mode: StreamingMode = LOW_LATENCY, cfg: SpeakerCacheConfig = NEMOTRON3_STREAMING_CONFIG) {
    this.cfg = cfg;
    this.cache = new SpeakerCache(cfg);
  }

  private get factor() {
    return this.cfg.subsamplingFactor;
  }

  /** 每個 chunk 帶的 mel 幀數（本體 + look-ahead） */
  get melFramesPerChunk() {
    return (this.mode.chunkLength + this.mode.lookahead) * this.factor;
  }

  /** 每步前進的 mel 幀數 */
  get melFramesPerStep() {
    return this.mode.chunkLength * this.factor;
  }

  /** 對應處理器的 num_samples_first_audio_chunk 與 num_samples_per_audio_chunk（win_length = 400） */
  private samplesNeeded(): number {
    const frames = this.melFramesPerChunk;
    return this.emittedMelFrames === 0 ? (frames - 1) * HOP + 200 : frames * HOP + 400;
  }

  private chunkStartSample(): number {
    return this.emittedMelFrames === 0 ? 0 : this.emittedMelFrames * HOP - N_FFT / 2;
  }

  /** 餵入音訊；回傳這次完成的所有結果（可能零個或多個 chunk） */
  async feed(pcm: Float32Array): Promise<ProbsChunk[]> {
    const merged = new Float32Array(this.buffer.length + pcm.length);
    merged.set(this.buffer, 0);
    merged.set(pcm, this.buffer.length);
    this.buffer = merged;
    const out: ProbsChunk[] = [];
    while (this.buffer.length >= this.chunkStartSample() - this.consumedSamples + this.samplesNeeded()) {
      const res = await this.step(false);
      if (res) out.push(res);
      else break;
    }
    return out;
  }

  /** buffer[0] 對應整場的哪個樣本 */
  private consumedSamples = 0;

  /** 結束時把剩餘音訊當最後一個 chunk（沒有 look-ahead）處理 */
  async flush(): Promise<ProbsChunk | null> {
    return this.step(true);
  }

  private async step(isLast: boolean): Promise<ProbsChunk | null> {
    if (this.busy) return null;
    const center = this.emittedMelFrames === 0;
    const start = this.chunkStartSample() - this.consumedSamples;
    if (start < 0) return null;
    const need = isLast ? 0 : this.samplesNeeded();
    if (!isLast && this.buffer.length - start < need) return null;
    const audio = isLast ? this.buffer.subarray(start) : this.buffer.subarray(start, start + need);
    let melFrames = numFrames(audio.length, center);
    if (isLast) melFrames = Math.min(melFrames, this.buffer.length); // 保險
    if (melFrames < this.factor) return null;
    // 最後一個 chunk：只取到 8 的倍數，避免 feature stacking 補零的尾巴
    if (isLast) melFrames -= melFrames % this.factor;
    if (!isLast && melFrames !== this.melFramesPerChunk) return null;

    this.busy = true;
    try {
      const { features } = this.mel.extract(audio.subarray(0, isLast ? Math.min(audio.length, (melFrames - 1) * HOP + N_FFT) : audio.length), center);
      const feats = features.subarray(0, melFrames * N_MELS);
      const cached = this.cache.getEmbeds();
      const numCached = cached.length / this.cfg.hiddenSize;
      const numChunkEncoder = melFrames / this.factor;
      const output = await this.run(feats, melFrames, cached, numCached, numCached + numChunkEncoder);
      const numChunkFrames = isLast ? numChunkEncoder : this.mode.chunkLength;
      // 模型輸入 = 快取 + chunk embeds；更新快取用的是這個完整序列
      const input = new Float32Array((numCached + numChunkEncoder) * this.cfg.hiddenSize);
      input.set(cached, 0);
      input.set(output.chunkEmbeds.subarray(0, numChunkEncoder * this.cfg.hiddenSize), cached.length);
      this.cache.update(input, output.logits, output.silenceEmbeds, numChunkFrames);

      const S = this.cfg.numSpeakers;
      const f = this.factor;
      const from = numCached * f;
      const count = numChunkFrames * f;
      const probs = new Float32Array(count * S);
      for (let i = 0; i < count * S; i++) probs[i] = sigmoid(output.logits[from * S + i]);
      const startFrame = this.emittedMelFrames;
      this.emittedMelFrames += count;
      // 丟掉已經不會再用到的音訊（下一個 chunk 從 emittedMelFrames*hop - 256 開始）
      const keepFrom = Math.max(0, this.emittedMelFrames * HOP - N_FFT / 2 - this.consumedSamples);
      if (keepFrom > 0) {
        this.buffer = this.buffer.slice(keepFrom);
        this.consumedSamples += keepFrom;
      }
      return { startFrame, probs };
    } finally {
      this.busy = false;
    }
  }
}
