/**
 * 轉錄引擎的統一介面。UI、儲存與狀態機只認這個介面，不認 Web Speech 或 Whisper。
 */
import type { AppError } from "@/lib/errors";
import type { Engine, LanguageMode } from "@/lib/types";

export type TranscriptionEvent =
  | { type: "interim"; text: string }
  | { type: "final"; text: string; atMs: number }
  | { type: "processing"; busy: boolean }
  /** 引擎意外停止，provider 會自己嘗試恢復；UI 顯示「正在恢復」 */
  | { type: "dropped"; reason: string }
  | { type: "recovered" }
  | { type: "model-progress"; progress: ModelProgress }
  | { type: "error"; error: AppError };

export interface ModelProgress {
  status: "downloading" | "loading" | "ready" | "error" | "cancelled";
  /** 0–1 */
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  file?: string;
  message?: string;
}

export interface StartOptions {
  stream: MediaStream;
  languageMode: LanguageMode;
  /** 課程詞彙，支援 phrase biasing 的引擎會拿去當提示 */
  phrases: string[];
}

export interface TranscriptionProvider {
  readonly engine: Engine;
  /** 引擎需要網路（快速模式）還是完全本機 */
  readonly needsNetwork: boolean;
  subscribe(listener: (e: TranscriptionEvent) => void): () => void;
  start(opts: StartOptions): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
}

export class Emitter {
  private listeners = new Set<(e: TranscriptionEvent) => void>();
  subscribe(l: (e: TranscriptionEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(e: TranscriptionEvent) {
    for (const l of this.listeners) l(e);
  }
}
