/**
 * 講者分離 Worker：載入 Nemotron 3 Diarization 的 ONNX 模型，收 16 kHz PCM，吐每 10 ms 的講者機率。
 * 音訊只在這個 worker 與主執行緒之間流動，不離開裝置。
 */
import * as ort from "onnxruntime-web/webgpu";
import { NemotronStreamer, type ModelOutput } from "@/lib/diarization/streamer";
import { loadNemotronFiles, NEMOTRON_DATA_FILE, setNemotronRepo } from "./model-files";

export type DiarWorkerIn =
  | { type: "load"; preferWebgpu: boolean; modelBase?: string | null; wasmBase?: string | null }
  | { type: "feed"; pcm: Float32Array }
  | { type: "flush" };

export type DiarWorkerOut =
  | { type: "progress"; phase: "download" | "init"; loaded: number; total: number }
  | { type: "ready"; provider: "webgpu" | "wasm" }
  | { type: "probs"; startFrame: number; probs: Float32Array }
  | { type: "error"; message: string; fatal: boolean };

// wasm 執行檔從 CDN 載入：GitHub Pages 這種靜態站沒辦法讓 bundler 正確擺放這些檔案
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
// 沒有跨來源隔離就沒有多執行緒，明講單執行緒避免 runtime 自己試了又退回
ort.env.wasm.numThreads = 1;

const post = (m: DiarWorkerOut, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

let session: ort.InferenceSession | null = null;
let streamer: NemotronStreamer | null = null;
let provider: "webgpu" | "wasm" = "wasm";
let feeding: Promise<void> = Promise.resolve();

async function load(preferWebgpu: boolean, modelBase?: string | null, wasmBase?: string | null) {
  try {
    setNemotronRepo(modelBase);
    if (wasmBase) ort.env.wasm.wasmPaths = wasmBase.endsWith("/") ? wasmBase : `${wasmBase}/`;
    const files = await loadNemotronFiles((p) => post({ type: "progress", phase: "download", loaded: p.loaded, total: p.total }));
    post({ type: "progress", phase: "init", loaded: 0, total: 0 });
    const providers: Array<"webgpu" | "wasm"> = preferWebgpu ? ["webgpu", "wasm"] : ["wasm"];
    let lastErr: unknown = null;
    for (const ep of providers) {
      try {
        session = await ort.InferenceSession.create(files.model, {
          executionProviders: [ep],
          externalData: [{ path: NEMOTRON_DATA_FILE, data: files.data }],
          graphOptimizationLevel: "all",
        });
        provider = ep;
        break;
      } catch (err) {
        lastErr = err;
        session = null;
      }
    }
    if (!session) throw lastErr ?? new Error("無法建立推論 session");
    streamer = new NemotronStreamer(runModel);
    post({ type: "ready", provider });
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err), fatal: true });
  }
}

async function runModel(feats: Float32Array, melFrames: number, cached: Float32Array, numCached: number, maskLen: number): Promise<ModelOutput> {
  const out = await session!.run({
    input_features: new ort.Tensor("float32", feats, [1, melFrames, 128]),
    cached_embeds: new ort.Tensor("float32", cached, [1, numCached, 512]),
    attention_mask: new ort.Tensor("int64", BigInt64Array.from({ length: maskLen }, () => 1n), [1, maskLen]),
  });
  return {
    logits: out.logits.data as Float32Array,
    chunkEmbeds: out.chunk_embeds.data as Float32Array,
    silenceEmbeds: out.silence_embeds.data as Float32Array,
  };
}

function feed(pcm: Float32Array) {
  if (!streamer) return;
  const s = streamer;
  feeding = feeding.then(async () => {
    try {
      const chunks = await s.feed(pcm);
      for (const c of chunks) post({ type: "probs", startFrame: c.startFrame, probs: c.probs }, [c.probs.buffer]);
    } catch (err) {
      post({ type: "error", message: (err as Error)?.message ?? String(err), fatal: false });
    }
  });
}

self.onmessage = (e: MessageEvent<DiarWorkerIn>) => {
  const m = e.data;
  if (m.type === "load") void load(m.preferWebgpu, m.modelBase, m.wasmBase);
  else if (m.type === "feed") feed(m.pcm);
  else if (m.type === "flush") {
    const s = streamer;
    feeding = feeding.then(async () => {
      const c = await s?.flush();
      if (c) post({ type: "probs", startFrame: c.startFrame, probs: c.probs }, [c.probs.buffer]);
    });
  }
};
