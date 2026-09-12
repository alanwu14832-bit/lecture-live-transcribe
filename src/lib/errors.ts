/**
 * 錯誤對應：把技術例外翻成使用者看得懂的三段式訊息，
 * 「發生什麼事、會不會丟資料、接下來可以做什麼」。
 */

export type ErrorAction = "retry" | "switch-to-fast" | "reload" | "dismiss" | "open-permission-help" | "open-settings";

export interface AppError {
  code: string;
  title: string;
  detail: string;
  /** 已完成的逐字稿是否安全。目前的設計下永遠是 true，但顯示給使用者看很重要。 */
  dataSafe: boolean;
  actions: Array<{ label: string; action: ErrorAction }>;
  /** 是否為持續性錯誤（要顯示常駐錯誤列而不是短暫提示） */
  persistent: boolean;
}

const SAFE = "已完成的文字仍安全保存在這台裝置。";

export const ERRORS = {
  speechUnsupported: (): AppError => ({
    code: "speech-unsupported",
    title: "這個瀏覽器不支援快速模式",
    detail: `快速模式需要瀏覽器內建的語音辨識，目前 Chrome 與 Edge 支援最完整。${SAFE}你可以改用本機雙語辨識，或換用 Chrome 開啟。`,
    dataSafe: true,
    actions: [{ label: "知道了", action: "dismiss" }],
    persistent: true,
  }),
  permissionDenied: (): AppError => ({
    code: "permission-denied",
    title: "麥克風權限被拒絕",
    detail: `沒有麥克風就無法轉錄。${SAFE}請點網址列左側的鎖頭圖示，把麥克風改為「允許」，然後重試。`,
    dataSafe: true,
    actions: [
      { label: "重試", action: "retry" },
      { label: "怎麼開啟權限", action: "open-permission-help" },
    ],
    persistent: true,
  }),
  noMicrophone: (): AppError => ({
    code: "no-microphone",
    title: "找不到麥克風",
    detail: `系統沒有偵測到任何輸入裝置。${SAFE}請接上麥克風或檢查系統音訊設定後重試。`,
    dataSafe: true,
    actions: [{ label: "重試", action: "retry" }],
    persistent: true,
  }),
  recognitionDropped: (): AppError => ({
    code: "recognition-dropped",
    title: "轉錄暫時中斷",
    detail: `${SAFE}正在嘗試重新連線⋯`,
    dataSafe: true,
    actions: [],
    persistent: true,
  }),
  recognitionFailed: (): AppError => ({
    code: "recognition-failed",
    title: "無法恢復語音辨識",
    detail: `連續多次重新連線都失敗，可能是網路中斷或瀏覽器的辨識服務暫時無法使用。${SAFE}`,
    dataSafe: true,
    actions: [
      { label: "重新連線", action: "retry" },
      { label: "重新整理頁面", action: "reload" },
    ],
    persistent: true,
  }),
  networkLost: (): AppError => ({
    code: "network-lost",
    title: "網路中斷",
    detail: `快速模式需要網路才能辨識。${SAFE}網路恢復後會自動重新連線；如果教室網路不穩，本機雙語辨識不需要網路。`,
    dataSafe: true,
    actions: [{ label: "重新連線", action: "retry" }],
    persistent: true,
  }),
  webgpuUnavailable: (): AppError => ({
    code: "webgpu-unavailable",
    title: "這台裝置無法加速本機模型",
    detail: "沒有 WebGPU，本機雙語辨識會改用較慢的模式，延遲可能到十幾秒。你可以繼續，或改用快速模式。",
    dataSafe: true,
    actions: [
      { label: "改用快速模式", action: "switch-to-fast" },
      { label: "仍要繼續", action: "dismiss" },
    ],
    persistent: false,
  }),
  modelLoadFailed: (reason: string): AppError => ({
    code: "model-load-failed",
    title: "模型載入失敗",
    detail: `${reason || "下載中斷或瀏覽器無法載入模型。"} ${SAFE}你可以重試下載，或先用快速模式。`,
    dataSafe: true,
    actions: [
      { label: "重試", action: "retry" },
      { label: "先用快速模式", action: "switch-to-fast" },
    ],
    persistent: true,
  }),
  workerCrashed: (): AppError => ({
    code: "worker-crashed",
    title: "本機辨識程序停止了",
    detail: `可能是裝置記憶體不足。${SAFE}你可以重新啟動本機辨識，或改用快速模式。`,
    dataSafe: true,
    actions: [
      { label: "重新啟動", action: "retry" },
      { label: "改用快速模式", action: "switch-to-fast" },
    ],
    persistent: true,
  }),
  storageFailed: (): AppError => ({
    code: "storage-failed",
    title: "無法寫入這台裝置的儲存空間",
    detail: "瀏覽器拒絕寫入 IndexedDB，可能是隱私模式或空間不足。畫面上的文字還在，但重新整理後可能消失。建議立刻複製全文或匯出。",
    dataSafe: false,
    actions: [{ label: "知道了", action: "dismiss" }],
    persistent: true,
  }),
  insecureContext: (): AppError => ({
    code: "insecure-context",
    title: "需要 HTTPS 才能使用麥克風",
    detail: "瀏覽器只允許安全來源存取麥克風。請用 https:// 或 localhost 開啟本站。",
    dataSafe: true,
    actions: [{ label: "知道了", action: "dismiss" }],
    persistent: true,
  }),
  groqKeyMissing: (): AppError => ({
    code: "groq-key-missing",
    title: "還沒設定 Groq 金鑰",
    detail: `自備金鑰引擎需要一組 Groq API key（免費申請）。${SAFE}到設定貼上金鑰後重試，或改用快速模式。`,
    dataSafe: true,
    actions: [
      { label: "開啟設定", action: "open-settings" },
      { label: "改用快速模式", action: "switch-to-fast" },
    ],
    persistent: true,
  }),
  groqKeyInvalid: (): AppError => ({
    code: "groq-key-invalid",
    title: "Groq 拒絕了這組金鑰",
    detail: `金鑰可能貼錯、已撤銷或額度用完。${SAFE}請到設定重新貼上，或改用快速模式。`,
    dataSafe: true,
    actions: [
      { label: "開啟設定", action: "open-settings" },
      { label: "改用快速模式", action: "switch-to-fast" },
    ],
    persistent: true,
  }),
  groqUnreachable: (): AppError => ({
    code: "groq-unreachable",
    title: "連不上 Groq",
    detail: `連續多次上傳都失敗，可能是網路中斷或服務暫時無法使用。${SAFE}`,
    dataSafe: true,
    actions: [
      { label: "重新連線", action: "retry" },
      { label: "改用快速模式", action: "switch-to-fast" },
    ],
    persistent: true,
  }),
  unknown: (message: string): AppError => ({
    code: "unknown",
    title: "發生未預期的問題",
    detail: `${message || "未知錯誤"}。${SAFE}`,
    dataSafe: true,
    actions: [
      { label: "重試", action: "retry" },
      { label: "重新整理頁面", action: "reload" },
    ],
    persistent: true,
  }),
};

/** getUserMedia 的例外名稱對應 */
export function mapMediaError(err: unknown): AppError {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return ERRORS.permissionDenied();
  if (name === "NotFoundError" || name === "OverconstrainedError") return ERRORS.noMicrophone();
  if (name === "NotReadableError") return ERRORS.unknown("麥克風被其他程式佔用");
  return ERRORS.unknown((err as Error)?.message ?? "");
}
