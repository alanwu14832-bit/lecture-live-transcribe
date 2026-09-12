import { describe, expect, it } from "vitest";
import { VadSegmenter } from "./vad";

const SR = 16000;
function tone(ms: number, amp: number) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR);
  return out;
}
function silence(ms: number, amp = 0.001) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * (Math.random() * 2 - 1);
  return out;
}
function feedAll(v: VadSegmenter, parts: Float32Array[], chunk = 1024) {
  const segs = [];
  for (const p of parts) {
    for (let i = 0; i < p.length; i += chunk) segs.push(...v.feed(p.slice(i, i + chunk)));
  }
  return segs;
}

describe("VadSegmenter", () => {
  it("在停頓處切出一段講話，並保留講話前的 pre-roll", () => {
    const v = new VadSegmenter();
    const segs = feedAll(v, [silence(1000), tone(2000, 0.2), silence(1000)]);
    expect(segs).toHaveLength(1);
    const durMs = (segs[0].audio.length / SR) * 1000;
    expect(durMs).toBeGreaterThan(2000);
    expect(durMs).toBeLessThan(3200);
    // 段落開始在講話開始（1000ms）之前約 300ms
    expect(segs[0].startSample / SR).toBeGreaterThan(0.6);
    expect(segs[0].startSample / SR).toBeLessThan(1.0);
  });

  it("太短的聲音當雜音丟掉", () => {
    const v = new VadSegmenter();
    const segs = feedAll(v, [silence(500), tone(200, 0.2), silence(1000)]);
    expect(segs).toHaveLength(0);
  });

  it("連續講太久會在最長長度處切開，之後的音訊接到下一段", () => {
    const v = new VadSegmenter({ maxSegmentMs: 5000 });
    const segs = feedAll(v, [tone(12000, 0.2), silence(1000)]);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const s of segs) expect(s.audio.length / SR).toBeLessThanOrEqual(5.2);
    const total = segs.reduce((n, s) => n + s.audio.length, 0) / SR;
    expect(total).toBeGreaterThan(11.5);
  });

  it("flush 會把手上未完成的段落送出，沒有講話時回 null", () => {
    const v = new VadSegmenter();
    feedAll(v, [silence(500), tone(1500, 0.2)]);
    const seg = v.flush();
    expect(seg).not.toBeNull();
    expect(seg!.audio.length / SR).toBeGreaterThan(1.4);
    expect(v.flush()).toBeNull();
  });

  it("穩定的背景噪音不會被當成講話", () => {
    const v = new VadSegmenter();
    const segs = feedAll(v, [silence(6000, 0.004)]);
    expect(segs).toHaveLength(0);
    expect(v.flush()).toBeNull();
  });
});
