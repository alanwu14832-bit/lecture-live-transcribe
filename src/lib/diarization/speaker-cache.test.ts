import { describe, expect, it } from "vitest";
import { NEMOTRON3_STREAMING_CONFIG, SpeakerCache } from "./speaker-cache";

const H = 512;
const S = 8;

/** 造一步的輸入：cached 幀 + chunk 幀的 embeds，以及對應 logits（指定每幀的主要講者） */
function step(cache: SpeakerCache, numChunk: number, lookahead: number, speakerOf: (frameIdx: number) => number, base: number) {
  const cached = cache.getEmbeds();
  const numCached = cached.length / H;
  const total = numCached + numChunk + lookahead;
  const input = new Float32Array(total * H);
  input.set(cached, 0);
  for (let t = numCached; t < total; t++) {
    const frameIdx = base + (t - numCached);
    for (let d = 0; d < H; d++) input[t * H + d] = speakerOf(frameIdx) + d / H / 1000 + frameIdx * 1e-6;
  }
  const logits = new Float32Array(total * 8 * S);
  for (let t = 0; t < total; t++) {
    const frameIdx = t < numCached ? -1 : base + (t - numCached);
    const spk = frameIdx < 0 ? 0 : speakerOf(frameIdx);
    for (let j = 0; j < 8; j++) for (let s = 0; s < S; s++) logits[(t * 8 + j) * S + s] = s === spk ? 4 : -4;
  }
  cache.update(input, logits, new Float32Array(H).fill(-1), numChunk);
  return { numCached };
}

describe("SpeakerCache", () => {
  it("FIFO 未滿之前不會有東西進快取；chunk 本體進 FIFO、look-ahead 不進", () => {
    const c = new SpeakerCache();
    step(c, 9, 4, () => 0, 0);
    expect(c.numFifoFrames).toBe(9);
    expect(c.numCacheFrames).toBe(0);
    expect(c.getEmbeds().length).toBe(9 * H);
    step(c, 9, 4, () => 0, 9);
    expect(c.numFifoFrames).toBe(18);
  });

  it("FIFO 溢出時至少移 updatePeriod 幀到快取", () => {
    const c = new SpeakerCache();
    let base = 0;
    while (c.numFifoFrames + 9 <= NEMOTRON3_STREAMING_CONFIG.fifoLength) {
      step(c, 9, 4, () => 0, base);
      base += 9;
    }
    expect(c.numCacheFrames).toBe(0);
    step(c, 9, 4, () => 0, base);
    expect(c.numCacheFrames).toBe(NEMOTRON3_STREAMING_CONFIG.speakerCacheUpdatePeriod);
    expect(c.numFifoFrames).toBe(c.numCachedFrames - c.numCacheFrames);
    expect(c.isCompressed).toBe(false);
  });

  it("快取超過容量會壓縮到 speakerCacheLength，並且兩位講者都保留代表幀", () => {
    const c = new SpeakerCache();
    let base = 0;
    // 前半講者 0、後半講者 1，餵很多 chunk 直到壓縮
    const speakerOf = (f: number) => (f < 300 ? 0 : 1);
    for (let i = 0; i < 90; i++) {
      step(c, 9, 4, speakerOf, base);
      base += 9;
    }
    expect(c.isCompressed).toBe(true);
    expect(c.numCacheFrames).toBe(NEMOTRON3_STREAMING_CONFIG.speakerCacheLength);
    expect(c.numFifoFrames).toBeLessThanOrEqual(NEMOTRON3_STREAMING_CONFIG.fifoLength);
    // 快取 embeds 的第一個維度值編碼了講者（0 或 1）或 silence（-1）
    const embeds = c.getEmbeds();
    const counts = { spk0: 0, spk1: 0, silence: 0 };
    for (let t = 0; t < c.numCacheFrames; t++) {
      const v = embeds[t * H];
      if (v < -0.5) counts.silence += 1;
      else if (v < 0.5) counts.spk0 += 1;
      else counts.spk1 += 1;
    }
    expect(counts.spk0).toBeGreaterThan(20);
    expect(counts.spk1).toBeGreaterThan(20);
    expect(counts.silence).toBeGreaterThanOrEqual(1);
    // 總輸入幀數不會無限成長
    expect(c.numCachedFrames).toBeLessThanOrEqual(NEMOTRON3_STREAMING_CONFIG.speakerCacheLength + NEMOTRON3_STREAMING_CONFIG.fifoLength);
  });
});
