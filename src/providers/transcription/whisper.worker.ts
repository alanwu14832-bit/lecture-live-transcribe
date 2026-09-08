/**
 * 本機雙語辨識的 Web Worker。模型載入與推論都在這裡跑，主執行緒只收訊息。
 * 音訊只在這個 worker 與主執行緒之間傳遞，不會離開裝置。
 *
 * 不走 pipeline 的 __call__ 而是自己呼叫 processor → generate → decode，原因是
 * Transformers.js 3.x 的 pipeline 沒有實作 Whisper 的前文提示（prompt_ids），
 * 但 generate 接受 decoder_input_ids 當起始 token，我們就自己組
 * <|startofprev|> 詞彙提示 <|startoftranscript|><|zh|><|transcribe|><|notimestamps|>。
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { needsTraditionalConversion, type WhisperLanguage } from "./whisper-hints";

// 只從 Hugging Face Hub 抓公開模型，不要去找本機路徑（瀏覽器沒有）
env.allowLocalModels = false;

export type WorkerIn =
  | { type: "load"; model: string; device: "webgpu" | "wasm" }
  | { type: "transcribe"; id: number; audio: Float32Array; language: WhisperLanguage; prompt: string; traditional: boolean };

export type WorkerOut =
  | { type: "progress"; file: string; loaded: number; total: number; status: string }
  | { type: "ready"; model: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; message: string; fatal: boolean };

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModel = "";
let toTraditional: ((s: string) => string) | null = null;

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
    // Whisper 的中文幾乎都輸出簡體，台灣學生要看繁體：簡轉繁字典只在本機模式才載
    if (!toTraditional) {
      const OpenCC = await import("opencc-js/cn2t");
      toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
    }
    post({ type: "ready", model });
  } catch (err) {
    asr = null;
    post({ type: "error", message: (err as Error)?.message ?? String(err), fatal: true });
  }
}

interface TokenizerLike {
  encode(text: string, opts?: { add_special_tokens?: boolean }): number[];
  decode(ids: number[] | bigint[], opts?: { skip_special_tokens?: boolean }): string;
  model: { convert_tokens_to_ids(tokens: string[]): number[] };
}

/** 組 Whisper 的起始 token；任何特殊 token 查不到就回 null，改用模型預設流程（沒有提示） */
function buildInitTokens(tokenizer: TokenizerLike, language: WhisperLanguage, prompt: string): number[] | null {
  const [sop, sot, lang, task, nots] = tokenizer.model.convert_tokens_to_ids(["<|startofprev|>", "<|startoftranscript|>", `<|${language}|>`, "<|transcribe|>", "<|notimestamps|>"]);
  if ([sop, sot, lang, task, nots].some((t) => t == null || Number.isNaN(t))) return null;
  const tokens: number[] = [];
  if (prompt) {
    // 前文提示要以空白開頭，這是 Whisper 訓練時的格式
    const promptIds = tokenizer.encode(" " + prompt.trim(), { add_special_tokens: false }).slice(0, 220);
    tokens.push(sop, ...promptIds);
  }
  tokens.push(sot, lang, task, nots);
  return tokens;
}

async function transcribe(m: Extract<WorkerIn, { type: "transcribe" }>) {
  if (!asr) {
    post({ type: "error", message: "模型尚未載入", fatal: false });
    return;
  }
  try {
    const tokenizer = asr.tokenizer as unknown as TokenizerLike;
    const processor = asr.processor as unknown as (audio: Float32Array) => Promise<{ input_features: unknown }>;
    const model = asr.model as unknown as {
      generate(opts: Record<string, unknown>): Promise<{ tolist(): Array<Array<number | bigint>> }>;
    };
    const { input_features } = await processor(m.audio);
    const initTokens = buildInitTokens(tokenizer, m.language, m.prompt);
    // task 固定 transcribe，絕不用 translate；language 是提示不是限制，模型聽到英文仍會寫英文
    const output = await model.generate({
      inputs: input_features,
      ...(initTokens ? { decoder_input_ids: initTokens } : { language: m.language, task: "transcribe" }),
      return_timestamps: false,
      max_new_tokens: 220,
    });
    const seq = output.tolist()[0] ?? [];
    // 輸出序列包含我們塞進去的起始 token（含提示文字），要切掉才不會把詞彙表當成逐字稿
    const generated = initTokens ? seq.slice(initTokens.length) : seq;
    let text = tokenizer.decode(generated as number[], { skip_special_tokens: true }).trim();
    if (m.traditional && toTraditional && needsTraditionalConversion(text)) text = toTraditional(text);
    post({ type: "result", id: m.id, text });
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err), fatal: false });
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "load") void load(msg.model, msg.device);
  else if (msg.type === "transcribe") void transcribe(msg);
};
