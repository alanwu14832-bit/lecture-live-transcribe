/**
 * 本機雙語模式：瀏覽器內的 multilingual Whisper。
 *
 * 流程：麥克風 → 16 kHz PCM → 每 CHUNK_SECONDS 切一塊（前面接上 OVERLAP 秒的舊音訊）
 * → 丟給 worker → 回來的文字用 mergeOverlap 去掉重疊 → 發 final。
 * 靜音的區塊直接跳過，不送模型，避免 Whisper 對著靜音產生幻覺句。
 */
import { ERRORS } from "@/lib/errors";
import { createPcmCapture, rms, TARGET_SAMPLE_RATE, type PcmCapture } from "@/lib/audio/mic";
import { isLikelyHallucination, mergeOverlap } from "@/lib/transcript/dedupe";
import { Emitter, type ModelProgress, type StartOptions, type TranscriptionProvider } from "./types";
import type { WorkerIn, WorkerOut } from "./whisper.worker";

export const WHISPER_MODELS = {
  // WebGPU 跑得動 small，中文明顯比 base 準；WASM 只跑 base，再大會慢到不能用
  webgpu: "onnx-community/whisper-small",
  wasm: "onnx-community/whisper-base",
} as const;

const CHUNK_SECONDS = 7;
const OVERLAP_SECONDS = 1.5;
const MIN_FLUSH_SECONDS = 1.2;
const SILENCE_RMS = 0.004;
/** 積壓超過這麼多秒就開始丟最舊的音訊，寧可漏一段也不要越落越後 */
const MAX_BACKLOG_SECONDS = 90;

export interface WhisperOptions {
  device: "webgpu" | "wasm";
  workletUrl: string;
}

export async function isWhisperModelCached(model: string): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    return keys.some((k) => k.url.includes(model));
  } catch {
    return false;
  }
}

export class WhisperProvider implements TranscriptionProvider {
  readonly engine = "whisper" as const;
  readonly needsNetwork = false;
  readonly model: string;
  private emitter = new Emitter();
  private worker: Worker | null = null;
  private capture: PcmCapture | null = null;
  private paused = false;
  private stopped = false;
  private busy = false;
  private pending: Float32Array[] = [];
  private pendingSamples = 0;
  private overlapTail: Float32Array = new Float32Array(0);
  private lastText = "";
  private nextId = 1;
  private inflight: { id: number; startMs: number; resolve?: () => void } | null = null;
  private chunkStartMs = 0;
  private progressByFile = new Map<string, { loaded: number; total: number }>();

  constructor(private opts: WhisperOptions) {
    this.model = WHISPER_MODELS[opts.device];
  }

  subscribe(l: Parameters<Emitter["subscribe"]>[0]) {
    return this.emitter.subscribe(l);
  }

  /** 只載模型，不開麥克風。首次使用的下載流程用這個。 */
  async loadModel(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    await new Promise<void>((resolve, reject) => {
      const w = this.worker!;
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === "progress") {
          this.progressByFile.set(m.file, { loaded: m.loaded, total: m.total });
          this.emitProgress(m.status === "progress" || m.status === "download" || m.status === "initiate" ? "downloading" : "loading", m.file);
        } else if (m.type === "ready") {
          this.emitProgress("ready");
          resolve();
        } else if (m.type === "error" && m.fatal) {
          this.emitProgress("error", undefined, m.message);
          reject(new Error(m.message));
        }
      };
      w.onerror = (ev) => {
        this.emitProgress("error", undefined, ev.message);
        reject(new Error(ev.message));
      };
      w.postMessage({ type: "load", model: this.model, device: this.opts.device } satisfies WorkerIn);
    });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => this.onWorkerMessage(e.data);
    this.worker.onerror = () => {
      this.emitter.emit({ type: "error", error: ERRORS.workerCrashed() });
    };
  }

  /** 取消下載：直接終止 worker。已下載的檔案留在瀏覽器快取，下次不用重抓。 */
  cancelLoad() {
    this.worker?.terminate();
    this.worker = null;
    this.emitProgress("cancelled");
  }

  private emitProgress(status: ModelProgress["status"], file?: string, message?: string) {
    let loaded = 0;
    let total = 0;
    for (const v of this.progressByFile.values()) {
      loaded += v.loaded;
      total += v.total;
    }
    this.emitter.emit({
      type: "model-progress",
      progress: { status, progress: total > 0 ? Math.min(1, loaded / total) : 0, loadedBytes: loaded, totalBytes: total, file, message },
    });
  }

  async start(opts: StartOptions): Promise<void> {
    this.stopped = false;
    this.paused = false;
    try {
      await this.loadModel();
    } catch (err) {
      this.emitter.emit({ type: "error", error: ERRORS.modelLoadFailed((err as Error)?.message ?? "") });
      throw err;
    }
    this.chunkStartMs = Date.now();
    this.capture = await createPcmCapture(opts.stream, (frames) => this.onFrames(frames), this.opts.workletUrl);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.flush(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.chunkStartMs = Date.now();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.capture?.stop();
    this.capture = null;
    // 把最後一點音訊送出去，等結果最多 20 秒，避免最後一句話不見
    if (this.pendingSamples >= MIN_FLUSH_SECONDS * TARGET_SAMPLE_RATE && this.worker) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 20000);
        this.flush(true, () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } else if (this.inflight && this.worker) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 20000);
        this.inflight!.resolve = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    this.worker?.terminate();
    this.worker = null;
    this.pending = [];
    this.pendingSamples = 0;
    this.overlapTail = new Float32Array(0);
    this.emitter.emit({ type: "processing", busy: false });
  }

  private onFrames(frames: Float32Array) {
    if (this.paused || this.stopped) return;
    this.pending.push(frames);
    this.pendingSamples += frames.length;
    const backlog = this.pendingSamples / TARGET_SAMPLE_RATE;
    if (backlog > MAX_BACKLOG_SECONDS) {
      // 裝置太慢跟不上：丟掉最舊的音訊並誠實告知
      while (this.pendingSamples / TARGET_SAMPLE_RATE > MAX_BACKLOG_SECONDS / 2 && this.pending.length) {
        this.pendingSamples -= this.pending.shift()!.length;
      }
      this.chunkStartMs = Date.now() - (this.pendingSamples / TARGET_SAMPLE_RATE) * 1000;
      this.emitter.emit({ type: "dropped", reason: "backlog" });
    }
    if (this.pendingSamples >= CHUNK_SECONDS * TARGET_SAMPLE_RATE) this.flush(false);
  }

  /** 把累積的音訊送去辨識。worker 忙碌中就先留著，等結果回來再送。 */
  private flush(force: boolean, onDone?: () => void) {
    if (!this.worker || this.busy) return;
    if (this.pendingSamples < (force ? MIN_FLUSH_SECONDS : CHUNK_SECONDS) * TARGET_SAMPLE_RATE) {
      onDone?.();
      return;
    }
    const body = concat(this.pending, this.pendingSamples);
    this.pending = [];
    this.pendingSamples = 0;
    const startMs = this.chunkStartMs;
    this.chunkStartMs = Date.now();
    const keep = Math.min(body.length, Math.round(OVERLAP_SECONDS * TARGET_SAMPLE_RATE));
    const audio = concat([this.overlapTail, body], this.overlapTail.length + body.length);
    this.overlapTail = body.slice(body.length - keep);
    if (rms(body) < SILENCE_RMS) {
      // 整塊都是靜音：不送模型（會幻覺），也不更新 lastText
      onDone?.();
      return;
    }
    const id = this.nextId++;
    this.busy = true;
    this.inflight = { id, startMs, resolve: onDone };
    this.emitter.emit({ type: "processing", busy: true });
    this.worker.postMessage({ type: "transcribe", id, audio } satisfies WorkerIn, [audio.buffer]);
  }

  private onWorkerMessage(m: WorkerOut) {
    if (m.type === "result") {
      const inflight = this.inflight;
      this.busy = false;
      this.inflight = null;
      if (inflight && inflight.id === m.id) {
        if (!isLikelyHallucination(m.text)) {
          const fresh = mergeOverlap(this.lastText, m.text);
          if (fresh) this.emitter.emit({ type: "final", text: fresh, atMs: inflight.startMs });
          this.lastText = m.text;
        }
        inflight.resolve?.();
      }
      this.emitter.emit({ type: "processing", busy: false });
      // 忙碌期間累積的音訊接著處理
      if (!this.stopped && !this.paused) this.flush(false);
    } else if (m.type === "error") {
      this.busy = false;
      const inflight = this.inflight;
      this.inflight = null;
      inflight?.resolve?.();
      this.emitter.emit({ type: "processing", busy: false });
      if (m.fatal) this.emitter.emit({ type: "error", error: ERRORS.workerCrashed() });
      else this.emitter.emit({ type: "dropped", reason: m.message });
    }
  }
}

function concat(parts: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
