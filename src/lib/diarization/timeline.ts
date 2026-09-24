/**
 * 講者活動時間軸：每 10 ms 一列、8 位講者的機率。轉錄段落完成後，用它判斷這一段主要是誰在講。
 */

export const FRAME_MS = 10;

export class SpeakerTimeline {
  private chunks: Array<{ startFrame: number; probs: Float32Array }> = [];
  readonly numSpeakers: number;

  constructor(numSpeakers = 8) {
    this.numSpeakers = numSpeakers;
  }

  /** @param startFrame 這批機率的第一幀在整場的位置（10 ms 為單位） */
  append(startFrame: number, probs: Float32Array) {
    this.chunks.push({ startFrame, probs });
  }

  get numFrames(): number {
    const last = this.chunks[this.chunks.length - 1];
    return last ? last.startFrame + last.probs.length / this.numSpeakers : 0;
  }

  /** [startSec, endSec) 內每位講者的活動量（機率超過 0.5 的幀數） */
  activity(startSec: number, endSec: number): Float32Array {
    const S = this.numSpeakers;
    const a = new Float32Array(S);
    const f0 = Math.max(0, Math.floor((startSec * 1000) / FRAME_MS));
    const f1 = Math.ceil((endSec * 1000) / FRAME_MS);
    for (const c of this.chunks) {
      const n = c.probs.length / S;
      const lo = Math.max(f0, c.startFrame);
      const hi = Math.min(f1, c.startFrame + n);
      for (let f = lo; f < hi; f++) {
        const base = (f - c.startFrame) * S;
        for (let s = 0; s < S; s++) if (c.probs[base + s] > 0.5) a[s] += 1;
      }
    }
    return a;
  }

  /** 主要講者；沒有任何人達到 minFrames 幀就回 null */
  dominantSpeaker(startSec: number, endSec: number, minFrames = 20): number | null {
    const a = this.activity(startSec, endSec);
    let best = -1;
    let bestVal = 0;
    for (let s = 0; s < a.length; s++) {
      if (a[s] > bestVal) {
        bestVal = a[s];
        best = s;
      }
    }
    return bestVal >= minFrames ? best : null;
  }

  /** 到目前為止出現過的講者（依首次出現順序，就是模型的通道順序） */
  seenSpeakers(minFrames = 50): number[] {
    const a = this.activity(0, this.numFrames / 100 + 1);
    const out: number[] = [];
    for (let s = 0; s < a.length; s++) if (a[s] >= minFrames) out.push(s);
    return out;
  }

  /** 釋放太舊的資料，避免三小時的課吃掉太多記憶體：保留最近 keepSec 秒 */
  trim(keepSec: number) {
    const cutoff = this.numFrames - (keepSec * 1000) / FRAME_MS;
    this.chunks = this.chunks.filter((c) => c.startFrame + c.probs.length / this.numSpeakers > cutoff);
  }
}
