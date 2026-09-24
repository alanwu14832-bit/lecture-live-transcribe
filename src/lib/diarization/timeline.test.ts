import { describe, expect, it } from "vitest";
import { SpeakerTimeline } from "./timeline";

function probs(frames: number, spk: number, p = 0.9) {
  const out = new Float32Array(frames * 8).fill(0.05);
  for (let f = 0; f < frames; f++) out[f * 8 + spk] = p;
  return out;
}

describe("SpeakerTimeline", () => {
  it("依時間區間找出主要講者", () => {
    const t = new SpeakerTimeline();
    t.append(0, probs(300, 0)); // 0–3 s 講者 0
    t.append(300, probs(200, 1)); // 3–5 s 講者 1
    expect(t.dominantSpeaker(0.5, 2.5)).toBe(0);
    expect(t.dominantSpeaker(3.2, 4.8)).toBe(1);
    expect(t.dominantSpeaker(2.0, 4.0)).toBe(0); // 2–3 是 0（100 幀），3–4 是 1（100 幀）→ 平手取先出現者
    expect(t.numFrames).toBe(500);
  });
  it("活動太少就回 null；靜音區間不算任何人", () => {
    const t = new SpeakerTimeline();
    t.append(0, probs(100, 2, 0.2));
    expect(t.dominantSpeaker(0, 1)).toBeNull();
    expect(t.seenSpeakers()).toEqual([]);
  });
  it("trim 只保留最近的秒數", () => {
    const t = new SpeakerTimeline();
    for (let i = 0; i < 10; i++) t.append(i * 100, probs(100, 0));
    t.trim(3);
    expect(t.dominantSpeaker(0, 2)).toBeNull();
    expect(t.dominantSpeaker(8, 10)).toBe(0);
  });
});
