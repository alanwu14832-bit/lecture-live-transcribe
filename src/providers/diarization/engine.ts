/**
 * 主執行緒的講者分離引擎：開 worker、餵麥克風 PCM、收機率進時間軸，並把課堂秒數對應到時間軸的幀。
 * 與轉錄引擎彼此獨立：任何一種轉錄引擎都能配講者分離。
 *
 * 裝置跟不上時（CPU 模式常見）不重置模型，而是直接略過一段音訊：講者身份得以保留，
 * 只是那幾秒沒有講者資料；略過的秒數會記下來，之後查講者時把課堂秒數對回時間軸秒數。
 */
import { createPcmCapture, type PcmCapture } from "@/lib/audio/mic";
import { SpeakerTimeline } from "@/lib/diarization/timeline";
import type { DiarWorkerIn, DiarWorkerOut } from "./nemotron.worker";

export type DiarizationEvent =
  | { type: "progress"; phase: "download" | "init"; loaded: number; total: number }
  | { type: "ready"; provider: "webgpu" | "wasm" }
  | { type: "lag"; droppedSeconds: number }
  | { type: "error"; message: string; fatal: boolean };

const SAMPLE_RATE = 16000;
/** 積壓超過這個秒數就開始略過新音訊 */
const MAX_BACKLOG_SEC = 12;

export class DiarizationEngine {
  readonly timeline = new SpeakerTimeline();
  private worker: Worker | null = null;
  private capture: PcmCapture | null = null;
  private listeners = new Set<(e: DiarizationEvent) => void>();
  private paused = false;
  private stopped = false;
  status: "idle" | "loading" | "ready" | "error" = "idle";
  provider: "webgpu" | "wasm" | null = null;
  /** 時間軸第 0 幀對應的課堂秒數 */
  private offsetSec = 0;
  /** 已送進 worker 的秒數（= 時間軸將來會有的長度） */
  private sentSec = 0;
  /** worker 已處理完的秒數 */
  private processedSec = 0;
  /** 略過的音訊：發生在時間軸的哪個位置、略過幾秒 */
  private drops: Array<{ atTimelineSec: number; seconds: number }> = [];
  private droppedTotal = 0;
  private lastLagNoticeSec = -Infinity;

  constructor(private readonly workletUrl: string) {}

  subscribe(l: (e: DiarizationEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(e: DiarizationEvent) {
    for (const l of this.listeners) l(e);
  }

  /** 載模型並開始收音。activeSecondsNow 是呼叫當下的課堂秒數，之後段落用課堂秒數查講者。 */
  async start(stream: MediaStream, preferWebgpu: boolean, activeSecondsNow: () => number): Promise<void> {
    this.status = "loading";
    this.worker = new Worker(new URL("./nemotron.worker.ts", import.meta.url), { type: "module" });
    await new Promise<void>((resolve, reject) => {
      const w = this.worker!;
      w.onmessage = (e: MessageEvent<DiarWorkerOut>) => {
        const m = e.data;
        if (m.type === "progress") this.emit(m);
        else if (m.type === "ready") {
          this.status = "ready";
          this.provider = m.provider;
          this.emit(m);
          resolve();
        } else if (m.type === "error" && m.fatal) {
          this.status = "error";
          this.emit(m);
          reject(new Error(m.message));
        }
      };
      w.onerror = (ev) => {
        this.status = "error";
        this.emit({ type: "error", message: ev.message, fatal: true });
        reject(new Error(ev.message));
      };
      // 自架鏡像（選填）：學校網路擋掉 Hugging Face 或 CDN 時用
      let modelBase: string | null = null;
      let wasmBase: string | null = null;
      try {
        modelBase = localStorage.getItem("casenote:nemotron-base");
        wasmBase = localStorage.getItem("casenote:ort-wasm-base");
      } catch {
        /* 沒有就用預設 */
      }
      w.postMessage({ type: "load", preferWebgpu, modelBase, wasmBase } satisfies DiarWorkerIn);
    });
    if (this.stopped) return;
    this.worker.onmessage = (e: MessageEvent<DiarWorkerOut>) => this.onMessage(e.data);
    this.offsetSec = activeSecondsNow();
    this.capture = await createPcmCapture(stream, (frames) => this.onFrames(frames), this.workletUrl);
  }

  private onMessage(m: DiarWorkerOut) {
    if (m.type === "probs") {
      this.timeline.append(m.startFrame, m.probs);
      this.processedSec = this.timeline.numFrames / 100;
    } else if (m.type === "error") this.emit(m);
  }

  private onFrames(frames: Float32Array) {
    if (this.paused || this.stopped || !this.worker) return;
    const sec = frames.length / SAMPLE_RATE;
    if (this.sentSec - this.processedSec > MAX_BACKLOG_SEC) {
      // 跟不上：這批不送，但記下來，之後查講者時用來對齊時間
      const last = this.drops[this.drops.length - 1];
      if (last && Math.abs(last.atTimelineSec - this.sentSec) < 1e-6) last.seconds += sec;
      else this.drops.push({ atTimelineSec: this.sentSec, seconds: sec });
      this.droppedTotal += sec;
      if (this.droppedTotal - this.lastLagNoticeSec >= 30) {
        this.lastLagNoticeSec = this.droppedTotal;
        this.emit({ type: "lag", droppedSeconds: Math.round(this.droppedTotal) });
      }
      return;
    }
    this.sentSec += sec;
    this.worker.postMessage({ type: "feed", pcm: frames } satisfies DiarWorkerIn, [frames.buffer]);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  /** 課堂秒數 → 時間軸秒數（扣掉 offset 與在那之前略過的音訊） */
  private toTimelineSec(activeSec: number): number {
    const t = activeSec - this.offsetSec;
    let dropped = 0;
    for (const d of this.drops) {
      if (d.atTimelineSec + dropped < t - dropped) dropped += d.seconds;
      else break;
    }
    return t - dropped;
  }

  /** 給 UI 看的進度：送了幾秒、算完幾秒、略過幾秒 */
  stats() {
    return { sentSec: this.sentSec, processedSec: this.processedSec, droppedSec: this.droppedTotal, backlogSec: Math.max(0, this.sentSec - this.processedSec) };
  }

  /** 時間軸目前覆蓋到哪個課堂秒數 */
  coveredUntilActiveSec(): number {
    return this.offsetSec + this.processedSec + this.droppedTotal;
  }

  /** 課堂秒數區間內的主要講者；資料還沒算到就回 undefined，判不出來回 null */
  speakerFor(startSec: number, endSec: number): number | null | undefined {
    const a = this.toTimelineSec(startSec);
    const b = this.toTimelineSec(Math.max(endSec, startSec + 0.8));
    if (b <= 0) return null;
    if (b > this.processedSec + 0.05) return undefined;
    return this.timeline.dominantSpeaker(Math.max(0, a), b, 20);
  }

  /** 等 worker 把積壓處理完，最多等 maxMs */
  async drain(maxMs: number): Promise<void> {
    const w = this.worker;
    if (w) w.postMessage({ type: "flush" } satisfies DiarWorkerIn);
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs && this.sentSec - this.processedSec > 0.8) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.capture?.stop();
    this.capture = null;
    const w = this.worker;
    this.worker = null;
    w?.terminate();
  }
}
