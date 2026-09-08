/**
 * 課堂狀態機。用一個明確的 status 取代一堆互相衝突的 boolean，
 * 「暫停後不可自行重啟」「錯誤時不丟資料」這類規則都在這裡用轉移表保證。
 */
import type { AppError } from "./errors";

export type SessionStatusValue =
  | "idle"
  | "checking-capability"
  | "requesting-permission"
  | "downloading-model"
  | "ready"
  | "listening"
  | "processing"
  | "paused"
  | "recovering"
  | "error"
  | "ended";

export interface MachineState {
  status: SessionStatusValue;
  error: AppError | null;
  /** 連續恢復嘗試次數，成功後歸零 */
  recoveryAttempts: number;
  /** 進入 error 前的狀態，重試時要知道該回到哪 */
  previous: SessionStatusValue | null;
}

export type MachineEvent =
  | { type: "CHECK" }
  | { type: "CAPABILITY_OK" }
  | { type: "REQUEST_PERMISSION" }
  | { type: "PERMISSION_GRANTED"; needsModel: boolean }
  | { type: "MODEL_READY" }
  | { type: "START" }
  | { type: "PROCESSING"; busy: boolean }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "ENGINE_DROPPED" }
  | { type: "RECOVERED" }
  | { type: "FAIL"; error: AppError }
  | { type: "RETRY" }
  /** 換引擎或重試時把狀態機清回 idle，重新走一次啟動流程；已結束的課堂不可重置 */
  | { type: "RESET" }
  | { type: "END" };

export const initialMachineState: MachineState = {
  status: "idle",
  error: null,
  recoveryAttempts: 0,
  previous: null,
};

export const MAX_RECOVERY_ATTEMPTS = 4;

const ACTIVE: SessionStatusValue[] = ["listening", "processing", "recovering"];

export function isActive(status: SessionStatusValue) {
  return ACTIVE.includes(status);
}

export function transition(state: MachineState, event: MachineEvent): MachineState {
  const s = state.status;
  switch (event.type) {
    case "CHECK":
      return s === "idle" ? { ...state, status: "checking-capability", error: null } : state;
    case "CAPABILITY_OK":
      return s === "checking-capability" ? { ...state, status: "ready" } : state;
    case "REQUEST_PERMISSION":
      return s === "ready" || s === "checking-capability" ? { ...state, status: "requesting-permission" } : state;
    case "PERMISSION_GRANTED":
      if (s !== "requesting-permission") return state;
      return { ...state, status: event.needsModel ? "downloading-model" : "ready" };
    case "MODEL_READY":
      return s === "downloading-model" ? { ...state, status: "ready" } : state;
    case "START":
      return s === "ready" ? { ...state, status: "listening", recoveryAttempts: 0, error: null } : state;
    case "PROCESSING":
      if (s === "listening" && event.busy) return { ...state, status: "processing" };
      if (s === "processing" && !event.busy) return { ...state, status: "listening" };
      return state;
    case "PAUSE":
      return isActive(s) ? { ...state, status: "paused" } : state;
    case "RESUME":
      return s === "paused" ? { ...state, status: "listening", recoveryAttempts: 0 } : state;
    case "ENGINE_DROPPED":
      // 只有仍在收音時才需要恢復；已暫停或已結束的課堂不能自己醒來
      if (s === "listening" || s === "processing") return { ...state, status: "recovering", recoveryAttempts: state.recoveryAttempts + 1 };
      if (s === "recovering") return { ...state, recoveryAttempts: state.recoveryAttempts + 1 };
      return state;
    case "RECOVERED":
      return s === "recovering" ? { ...state, status: "listening", recoveryAttempts: 0 } : state;
    case "FAIL":
      if (s === "ended") return state;
      return { ...state, status: "error", error: event.error, previous: s };
    case "RETRY":
      if (s !== "error") return state;
      // 從錯誤回到可以重新開始的狀態；已在收音中出錯就回 ready 讓使用者按繼續
      return { ...state, status: "ready", error: null, recoveryAttempts: 0 };
    case "RESET":
      return s === "ended" ? state : { ...initialMachineState };
    case "END":
      return s === "ended" ? state : { ...state, status: "ended", error: null };
    default:
      return state;
  }
}

export const STATUS_LABELS: Record<SessionStatusValue, string> = {
  idle: "尚未開始",
  "checking-capability": "檢查裝置",
  "requesting-permission": "等待麥克風權限",
  "downloading-model": "下載模型",
  ready: "準備就緒",
  listening: "正在聆聽",
  processing: "正在處理",
  paused: "已暫停",
  recovering: "正在恢復",
  error: "發生問題",
  ended: "已結束",
};
