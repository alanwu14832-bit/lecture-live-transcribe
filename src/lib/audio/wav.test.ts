import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

describe("encodeWav", () => {
  it("寫出正確的 RIFF 標頭與 16-bit 樣本", () => {
    const pcm = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWav(pcm, 16000);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(buf.byteLength).toBe(44 + 5 * 2);
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(10);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(v.getInt16(48, true)).toBe(-0x4000);
    expect(v.getInt16(50, true)).toBe(0x7fff);
    expect(v.getInt16(52, true)).toBe(-0x8000);
  });
});
