/**
 * 自備金鑰引擎：把停頓切出的完整句子以 WAV 上傳到 Groq 的 Whisper API。
 *
 * 為什麼存在：沒有 WebGPU 的電腦跑不動本機大模型，快速模式品質又不夠；
 * Groq 的 whisper-large-v3-turbo 有免費額度、品質接近付費服務。
 * 代價是音訊會送到 Groq 的伺服器，而且要使用者自己申請一組 key。
 * key 只存在瀏覽器 localStorage，每次請求直接從瀏覽器打到 Groq，中間沒有任何伺服器。
 */
import { ERRORS } from "@/lib/errors";
import { createPcmCapture, TARGET_SAMPLE_RATE, type PcmCapture } from "@/lib/audio/mic";
import { VadSegmenter, type VadSegment } from "@/lib/audio/vad";
import { encodeWav } from "@/lib/audio/wav";
import { isLikelyHallucination } from "@/lib/transcript/dedupe";
import type { LanguageMode } from "@/lib/types";
import { Emitter, type StartOptions, type TranscriptionProvider } from "./types";
import { buildWhisperPrompt, needsTraditionalConversion, whisperLanguageFor, type WhisperLanguage } from "./whisper-hints";

export const GROQ_API = "https://api.groq.com/openai/v1";
export const GROQ_MODEL = "whisper-large-v3-turbo";

const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 4;

export interface GroqOptions {
  apiKey: string;
  workletUrl: string;
  fetchImpl?: typeof fetch;
  /** 測試用：不開麥克風，直接餵 PCM */
  captureFactory?: (stream: MediaStream, onFrames: (f: Float32Array) => void) => Promise<PcmCapture>;
  /** 測試用：換掉簡轉繁 */
  toTraditional?: (s: string) => string;
  /** 測試用：縮短退避等待 */
  backoffMs?: number;
}

/** 用 /models 端點驗證金鑰。回 "ok"、"invalid" 或 "network"。 */
export async function testGroqKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<"ok" | "invalid" | "network"> {
  try {
    const res = await fetchImpl(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "network";
  } catch {
    return "network";
  }
}

export class GroqProvider implements TranscriptionProvider {
  readonly engine = "groq" as const;
  readonly needsNetwork = true;
  private emitter = new Emitter();
  private capture: PcmCapture | null = null;
  private vad = new VadSegmenter();
  private queue: VadSegment[] = [];
  private busy = false;
  private paused = false;
  private stopped = false;
  private language: WhisperLanguage = "zh";
  private prompt = "";
  private consecutiveFailures = 0;
  /** 串流第 0 個樣本對應的牆上時間，用來算每段的時間戳 */
  private baseMs = 0;
  private samplesFed = 0;
  private toTraditional: ((s: string) => string) | null = null;
  private drain: Promise<void> = Promise.resolve();

  constructor(private opts: GroqOptions) {}

  subscribe(l: Parameters<Emitter["subscribe"]>[0]) {
    return this.emitter.subscribe(l);
  }

  async start(o: StartOptions): Promise<void> {
    if (!this.opts.apiKey.trim()) {
      this.emitter.emit({ type: "error", error: ERRORS.groqKeyMissing() });
      throw new Error("groq-key-missing");
    }
    this.stopped = false;
    this.paused = false;
    this.language = whisperLanguageFor(o.languageMode);
    this.prompt = buildWhisperPrompt(o.phrases, this.language);
    if (!this.toTraditional) {
      if (this.opts.toTraditional) this.toTraditional = this.opts.toTraditional;
      else {
        const OpenCC = await import("opencc-js/cn2t");
        this.toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
      }
    }
    this.baseMs = Date.now();
    this.samplesFed = 0;
    const factory = this.opts.captureFactory ?? ((stream, onFrames) => createPcmCapture(stream, onFrames, this.opts.workletUrl));
    this.capture = await factory(o.stream, (frames) => this.onFrames(frames));
  }

  setLanguageMode(mode: LanguageMode) {
    this.language = whisperLanguageFor(mode);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    const seg = this.vad.flush();
    if (seg) this.enqueue(seg);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    // 暫停期間沒有餵樣本，重新對齊時間基準
    this.baseMs = Date.now() - (this.samplesFed / TARGET_SAMPLE_RATE) * 1000;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.capture?.stop();
    this.capture = null;
    const seg = this.vad.flush();
    if (seg) this.enqueue(seg);
    // 等最後幾段上傳完，最多 20 秒
    await Promise.race([this.drain, new Promise<void>((r) => setTimeout(r, 20000))]);
    this.emitter.emit({ type: "processing", busy: false });
  }

  private onFrames(frames: Float32Array) {
    if (this.paused || this.stopped) return;
    this.samplesFed += frames.length;
    for (const seg of this.vad.feed(frames)) this.enqueue(seg);
  }

  private enqueue(seg: VadSegment) {
    this.queue.push(seg);
    if (!this.busy) this.drain = this.pump();
  }

  private async pump() {
    this.busy = true;
    this.emitter.emit({ type: "processing", busy: true });
    try {
      while (this.queue.length > 0) {
        const seg = this.queue.shift()!;
        await this.transcribe(seg);
      }
    } finally {
      this.busy = false;
      this.emitter.emit({ type: "processing", busy: false });
    }
  }

  private async transcribe(seg: VadSegment) {
    const atMs = this.baseMs + (seg.startSample / TARGET_SAMPLE_RATE) * 1000;
    const wav = encodeWav(seg.audio, TARGET_SAMPLE_RATE);
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const backoff = this.opts.backoffMs ?? 1500;
    // 結束課堂後仍讓重試跑完：最後一句話值得多等幾秒，stop() 有 20 秒上限兜底
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const form = new FormData();
      form.append("file", new Blob([wav], { type: "audio/wav" }), "segment.wav");
      form.append("model", GROQ_MODEL);
      form.append("language", this.language);
      form.append("response_format", "json");
      form.append("temperature", "0");
      if (this.prompt) form.append("prompt", this.prompt);
      let res: Response;
      try {
        res = await fetchImpl(`${GROQ_API}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.opts.apiKey.trim()}` },
          body: form,
        });
      } catch {
        await sleep(backoff * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        this.stopped = true;
        this.emitter.emit({ type: "error", error: ERRORS.groqKeyInvalid() });
        return;
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        await sleep(Math.max(backoff * (attempt + 1), retryAfter * 1000));
        continue;
      }
      if (!res.ok) {
        // 4xx 其他錯誤（例如音訊格式）重試沒有意義，跳過這段
        this.noteFailure();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { text?: string };
      this.consecutiveFailures = 0;
      let text = (data.text ?? "").trim();
      if (!text || isLikelyHallucination(text)) return;
      if (this.language === "zh" && this.toTraditional && needsTraditionalConversion(text)) text = this.toTraditional(text);
      this.emitter.emit({ type: "final", text, atMs });
      return;
    }
    this.noteFailure();
  }

  private noteFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.stopped = true;
      this.queue = [];
      this.emitter.emit({ type: "error", error: ERRORS.groqUnreachable() });
    } else {
      this.emitter.emit({ type: "dropped", reason: "upload-failed" });
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
