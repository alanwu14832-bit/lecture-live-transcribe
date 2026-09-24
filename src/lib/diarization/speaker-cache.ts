/**
 * Nemotron 3 Diarization 的串流狀態：Arrival-Order Speaker Cache（AOSC）與 FIFO。
 * 這是 Hugging Face transformers 裡 Nemotron3DiarizationSpeakerCache 的 TypeScript 移植（batch = 1）。
 *
 * 每個 chunk 進模型時，前面接上「快取 + FIFO」的 encoder embeds；模型算完後，chunk 的幀推進 FIFO，
 * FIFO 溢出時把最舊的幀移到快取，快取超過容量就依講者分數壓縮，讓每位講者都保留代表幀。
 */

export interface SpeakerCacheConfig {
  fifoLength: number;
  speakerCacheUpdatePeriod: number;
  speakerCacheLength: number;
  silenceFramesPerSpeaker: number;
  predictionScoreThreshold: number;
  latestFramesScoreBoost: number;
  strongBoostRate: number;
  weakBoostRate: number;
  minPositiveScoresRate: number;
  numSpeakers: number;
  subsamplingFactor: number;
  hiddenSize: number;
}

/** nvidia/Nemotron-3-Diarization 的 streaming_config */
export const NEMOTRON3_STREAMING_CONFIG: SpeakerCacheConfig = {
  fifoLength: 264,
  speakerCacheUpdatePeriod: 222,
  speakerCacheLength: 264,
  silenceFramesPerSpeaker: 1,
  predictionScoreThreshold: 0.25,
  latestFramesScoreBoost: 0.05,
  strongBoostRate: 0.75,
  weakBoostRate: 1.5,
  minPositiveScoresRate: 0.5,
  numSpeakers: 8,
  subsamplingFactor: 8,
  hiddenSize: 512,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 前 k 大的索引（不排序），對應 torch.topk(sorted=False)；-Infinity 也可能被選到 */
function topkIndices(values: Float64Array | Float32Array, k: number, from = 0, to = values.length): number[] {
  const idx: number[] = [];
  for (let i = from; i < to; i++) idx.push(i);
  idx.sort((a, b) => values[b] - values[a]);
  return idx.slice(0, Math.min(k, idx.length));
}

export class SpeakerCache {
  readonly cfg: SpeakerCacheConfig;
  private readonly minPositiveScores: number;
  private readonly numStrongBoosted: number;
  private readonly numWeakBoosted: number;
  /** 快取 embeds，row-major [speakerCacheLength][hidden] */
  private embeds: Float32Array;
  private probs: Float32Array;
  private fifo: Float32Array;
  numCacheFrames = 0;
  numFifoFrames = 0;
  isCompressed = false;

  constructor(cfg: SpeakerCacheConfig = NEMOTRON3_STREAMING_CONFIG) {
    this.cfg = cfg;
    const budget = Math.floor(cfg.speakerCacheLength / cfg.numSpeakers) - cfg.silenceFramesPerSpeaker;
    this.minPositiveScores = Math.floor(budget * cfg.minPositiveScoresRate);
    this.numStrongBoosted = Math.floor(budget * cfg.strongBoostRate);
    this.numWeakBoosted = Math.floor(budget * cfg.weakBoostRate);
    this.embeds = new Float32Array(cfg.speakerCacheLength * cfg.hiddenSize);
    this.probs = new Float32Array(cfg.speakerCacheLength * cfg.numSpeakers);
    this.fifo = new Float32Array(cfg.fifoLength * cfg.hiddenSize);
  }

  /** 這一步要接在 chunk 前面的 embeds：[numCache + numFifo][hidden] */
  getEmbeds(): Float32Array {
    const h = this.cfg.hiddenSize;
    const out = new Float32Array((this.numCacheFrames + this.numFifoFrames) * h);
    out.set(this.embeds.subarray(0, this.numCacheFrames * h), 0);
    out.set(this.fifo.subarray(0, this.numFifoFrames * h), this.numCacheFrames * h);
    return out;
  }

  get numCachedFrames() {
    return this.numCacheFrames + this.numFifoFrames;
  }

  /** logits [(numInputFrames * factor)][numSpeakers] → 每個 encoder 幀的平均機率 */
  private poolProbs(logits: Float32Array, numInputFrames: number): Float32Array {
    const { subsamplingFactor: f, numSpeakers: S } = this.cfg;
    const out = new Float32Array(numInputFrames * S);
    for (let t = 0; t < numInputFrames; t++) {
      for (let s = 0; s < S; s++) {
        let acc = 0;
        for (let j = 0; j < f; j++) acc += sigmoid(logits[((t * f + j) * S) + s]);
        out[t * S + s] = acc / f;
      }
    }
    return out;
  }

  private numPoppedFrames(numFifoFrames: number): number {
    if (numFifoFrames <= this.cfg.fifoLength) return 0;
    return Math.min(Math.max(this.cfg.speakerCacheUpdatePeriod, numFifoFrames - this.cfg.fifoLength), numFifoFrames);
  }

  /**
   * @param chunkInputEmbeds 這一步餵給 encoder 的全部 embeds：快取 + FIFO + chunk（含 look-ahead）
   * @param chunkLogits 這一步的 logits，長度 = 輸入幀數 × factor × numSpeakers
   * @param silenceEmbeds 模型學到的靜音 embedding
   * @param numChunkFrames chunk 本體的幀數（不含 look-ahead）
   */
  update(chunkInputEmbeds: Float32Array, chunkLogits: Float32Array, silenceEmbeds: Float32Array, numChunkFrames: number) {
    const { hiddenSize: h, numSpeakers: S } = this.cfg;
    const numInputFrames = chunkInputEmbeds.length / h;
    const probs = this.poolProbs(chunkLogits, numInputFrames);
    const numCache = this.numCacheFrames;
    const numFifo = this.numFifoFrames;

    const chunkStart = numCache + numFifo;
    const chunkEmbeds = chunkInputEmbeds.subarray(chunkStart * h, (chunkStart + numChunkFrames) * h);
    let fifoEmbeds = new Float32Array((numFifo + numChunkFrames) * h);
    fifoEmbeds.set(this.fifo.subarray(0, numFifo * h), 0);
    fifoEmbeds.set(chunkEmbeds, numFifo * h);
    const fifoLen = numFifo + numChunkFrames;

    const numPopped = this.numPoppedFrames(fifoLen);
    if (numPopped) {
      // FIFO 幀在這一步輸入裡的位置緊接在快取後面，其機率由這一步重新估計
      const fifoProbs = probs.subarray(numCache * S, (numCache + fifoLen) * S);
      const storedProbs = this.isCompressed ? this.probs.subarray(0, numCache * S) : probs.subarray(0, numCache * S);
      let cacheEmbeds = new Float32Array((numCache + numPopped) * h);
      cacheEmbeds.set(this.embeds.subarray(0, numCache * h), 0);
      cacheEmbeds.set(fifoEmbeds.subarray(0, numPopped * h), numCache * h);
      let cacheProbs = new Float32Array((numCache + numPopped) * S);
      cacheProbs.set(storedProbs, 0);
      cacheProbs.set(fifoProbs.subarray(0, numPopped * S), numCache * S);
      fifoEmbeds = fifoEmbeds.slice(numPopped * h);

      if (numCache + numPopped > this.cfg.speakerCacheLength) {
        [cacheEmbeds, cacheProbs] = this.compress(cacheEmbeds, cacheProbs, silenceEmbeds);
        this.isCompressed = true;
      }
      this.numCacheFrames = cacheEmbeds.length / h;
      this.embeds.set(cacheEmbeds, 0);
      this.probs.set(cacheProbs, 0);
    }
    this.numFifoFrames = fifoEmbeds.length / h;
    this.fifo.set(fifoEmbeds, 0);
  }

  /** 每一幀對每位講者的分數；不是該講者講話的幀為 -Infinity */
  private frameScores(probs: Float32Array, numFrames: number): Float64Array {
    const { numSpeakers: S, predictionScoreThreshold: th } = this.cfg;
    const scores = new Float64Array(numFrames * S);
    const isSpeech = new Uint8Array(numFrames * S);
    const positiveCount = new Int32Array(S);
    for (let t = 0; t < numFrames; t++) {
      let sumLogC = 0;
      for (let s = 0; s < S; s++) sumLogC += Math.log(Math.max(1 - probs[t * S + s], th));
      for (let s = 0; s < S; s++) {
        const p = probs[t * S + s];
        const logP = Math.log(Math.max(p, th));
        const logC = Math.log(Math.max(1 - p, th));
        let score = logP - logC + sumLogC - Math.log(0.5);
        if (p > 0.5) {
          isSpeech[t * S + s] = 1;
          if (score > 0) positiveCount[s] += 1;
        } else {
          score = -Infinity;
        }
        scores[t * S + s] = score;
      }
    }
    // 某講者已有夠多明確屬於他的幀時，把「是他在講但分數不正」（重疊語音）的幀排除
    for (let s = 0; s < S; s++) {
      if (positiveCount[s] < this.minPositiveScores) continue;
      for (let t = 0; t < numFrames; t++) {
        const i = t * S + s;
        if (isSpeech[i] && !(scores[i] > 0)) scores[i] = -Infinity;
      }
    }
    return scores;
  }

  private boostScores(scores: Float64Array, numFrames: number, numBoosted: number, boost: number) {
    const S = this.cfg.numSpeakers;
    for (let s = 0; s < S; s++) {
      const col = new Float64Array(numFrames);
      for (let t = 0; t < numFrames; t++) col[t] = scores[t * S + s];
      for (const t of topkIndices(col, numBoosted)) scores[t * S + s] += boost;
    }
  }

  /** 保留最重要的 speakerCacheLength 幀，依講者分組、組內維持原始順序；每位講者留 silence 槽位 */
  private compress(embeds: Float32Array, probs: Float32Array, silenceEmbeds: Float32Array): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
    const { hiddenSize: h, numSpeakers: S, speakerCacheLength: L, silenceFramesPerSpeaker: nSil } = this.cfg;
    const numFrames = embeds.length / h;
    const scores = this.frameScores(probs, numFrames);
    for (let t = L; t < numFrames; t++) for (let s = 0; s < S; s++) scores[t * S + s] += this.cfg.latestFramesScoreBoost;
    this.boostScores(scores, numFrames, this.numStrongBoosted, -2 * Math.log(0.5));
    this.boostScores(scores, numFrames, this.numWeakBoosted, -Math.log(0.5));

    // 補上 nSil 個分數為 +Infinity 的 silence 幀（索引 numFrames..），對應 embeds 最後一列的 silence
    const numScored = numFrames + nSil;
    const sentinel = numScored * S;
    const flat = new Float64Array(numScored * S);
    for (let s = 0; s < S; s++) {
      for (let t = 0; t < numScored; t++) flat[s * numScored + t] = t < numFrames ? scores[t * S + s] : Infinity;
    }
    const picked = topkIndices(flat, L).map((i) => (flat[i] === -Infinity ? sentinel : i)).sort((a, b) => a - b);
    const outEmbeds = new Float32Array(L * h);
    const outProbs = new Float32Array(L * S);
    picked.forEach((idx, j) => {
      const frame = idx === sentinel ? numFrames : Math.min(idx % numScored, numFrames);
      if (frame === numFrames) outEmbeds.set(silenceEmbeds, j * h);
      else {
        outEmbeds.set(embeds.subarray(frame * h, (frame + 1) * h), j * h);
        outProbs.set(probs.subarray(frame * S, (frame + 1) * S), j * S);
      }
    });
    return [outEmbeds, outProbs];
  }
}
