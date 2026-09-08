/**
 * 本機雙語辨識的 Web Worker。模型載入與推論都在這裡跑，主執行緒只收訊息。
 * 音訊只在這個 worker 與主執行緒之間傳遞，不會離開裝置。
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

// 只從 Hugging Face Hub 抓公開模型，不要去找本機路徑（瀏覽器沒有）
env.allowLocalModels = false;

export type WorkerIn =
  | { type: "load"; model: string; device: "webgpu" | "wasm" }
  | { type: "transcribe"; id: number; audio: Float32Array };

export type WorkerOut =
  | { type: "progress"; file: string; loaded: number; total: number; status: string }
  | { type: "ready"; model: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; message: string; fatal: boolean };

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModel = "";

const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

/** WebGPU 用 fp32 encoder + q4 decoder 是 Transformers.js 官方範例的組合；WASM 全 q8 最省記憶體 */
function dtypeFor(device: "webgpu" | "wasm") {
  return device === "webgpu" ? { encoder_model: "fp32" as const, decoder_model_merged: "q4" as const } : "q8";
}

async function load(model: string, device: "webgpu" | "wasm") {
  if (asr && loadedModel === model) {
    post({ type: "ready", model });
    return;
  }
  try {
    // pipeline() 的多載型別太複雜，TypeScript 會放棄推導；這裡明確指定回傳型別
    const create = pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<AutomaticSpeechRecognitionPipeline>;
    asr = await create("automatic-speech-recognition", model, {
      device,
      dtype: dtypeFor(device),
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
        if (!p.file) return;
        post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0, status: p.status });
      },
    });
    loadedModel = model;
    post({ type: "ready", model });
  } catch (err) {
    asr = null;
    post({ type: "error", message: (err as Error)?.message ?? String(err), fatal: true });
  }
}

async function transcribe(id: number, audio: Float32Array) {
  if (!asr) {
    post({ type: "error", message: "模型尚未載入", fatal: false });
    return;
  }
  try {
    // 不指定 language：讓模型自己判斷每個區塊的語言，中英夾雜才不會被強制成單一語言。
    // task 固定 transcribe，絕不用 translate。
    const out = (await asr(audio, { task: "transcribe", return_timestamps: false })) as { text?: string } | Array<{ text?: string }>;
    const text = Array.isArray(out) ? out.map((o) => o.text ?? "").join(" ") : (out.text ?? "");
    post({ type: "result", id, text: text.trim() });
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err), fatal: false });
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === "load") void load(m.model, m.device);
  else if (m.type === "transcribe") void transcribe(m.id, m.audio);
};
