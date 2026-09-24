/**
 * 端到端驗證：用真的 Nemotron 3 Diarization ONNX 模型跑一段雙人對話。
 * 需要 NEMO_DIR 指向放有 model_q4.onnx、model_q4.onnx_data、two_speakers.wav 與 onnxruntime-node 的資料夾；沒有就跳過。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NemotronStreamer, type ModelOutput } from "./streamer";
import { SpeakerTimeline } from "./timeline";

const DIR = process.env.NEMO_DIR;
const ready = !!DIR && fs.existsSync(path.join(DIR, "model_q4.onnx")) && fs.existsSync(path.join(DIR, "two_speakers.wav"));

function readWav16k(file: string): Float32Array {
  const buf = fs.readFileSync(file);
  const sr = buf.readUInt32LE(24);
  const ch = buf.readUInt16LE(22);
  if (sr !== 16000 || ch !== 1) throw new Error(`need 16 kHz mono, got ${sr} Hz ${ch} ch`);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      const n = size / 2;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return out;
    }
    off += 8 + size;
  }
  throw new Error("no data chunk");
}

describe.skipIf(!ready)("Nemotron 3 Diarization end-to-end", () => {
  it("雙人對話會被分成兩位講者，且講者會交替", async () => {
    const ort = await import(/* @vite-ignore */ path.join(DIR!, "ort/node_modules/onnxruntime-node/dist/index.js"));
    const session = await ort.default.InferenceSession.create(path.join(DIR!, "model_q4.onnx"), { executionProviders: ["cpu"] });
    const T = ort.default.Tensor;
    const timings: number[] = [];
    const runner = async (feats: Float32Array, melFrames: number, cached: Float32Array, numCached: number, maskLen: number): Promise<ModelOutput> => {
      const t0 = Date.now();
      const out = await session.run({
        input_features: new T("float32", feats, [1, melFrames, 128]),
        cached_embeds: new T("float32", cached, [1, numCached, 512]),
        attention_mask: new T("int64", BigInt64Array.from({ length: maskLen }, () => 1n), [1, maskLen]),
      });
      timings.push(Date.now() - t0);
      return { logits: out.logits.data as Float32Array, chunkEmbeds: out.chunk_embeds.data as Float32Array, silenceEmbeds: out.silence_embeds.data as Float32Array };
    };
    const audio = readWav16k(path.join(DIR!, "two_speakers.wav"));
    const streamer = new NemotronStreamer(runner);
    const timeline = new SpeakerTimeline();
    // 模擬麥克風每 128 ms 丟一批
    const step = 2048;
    for (let i = 0; i < audio.length; i += step) {
      for (const c of await streamer.feed(audio.subarray(i, i + step))) timeline.append(c.startFrame, c.probs);
    }
    const last = await streamer.flush();
    if (last) timeline.append(last.startFrame, last.probs);

    const totalSec = audio.length / 16000;
    expect(timeline.numFrames / 100).toBeGreaterThan(totalSec - 2);
    const perSecond: Array<number | null> = [];
    for (let s = 0; s < Math.floor(totalSec); s++) perSecond.push(timeline.dominantSpeaker(s, s + 1, 30));
    const seen = timeline.seenSpeakers(100);
    let changes = 0;
    for (let i = 1; i < perSecond.length; i++) if (perSecond[i] != null && perSecond[i - 1] != null && perSecond[i] !== perSecond[i - 1]) changes++;
    console.log("per-second speakers:", perSecond.map((x) => (x == null ? "." : String(x))).join(""));
    console.log("seen:", seen, "changes:", changes, "avg ms/chunk:", (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(0), "chunks:", timings.length);
    expect(timings.length).toBeGreaterThan(60); // 60 秒 ÷ 0.72 秒 ≈ 82 個串流 chunk
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.length).toBeLessThanOrEqual(3);
    expect(changes).toBeGreaterThanOrEqual(1);
  }, 300000);
});
