/**
 * 介面偏好存 localStorage（主要資料在 IndexedDB）。
 * localStorage 在隱私模式或被封鎖時會丟例外，所以每次讀寫都包 try/catch，
 * 讀不到就用預設值，不能讓整個頁面掛掉。
 */

export type Theme = "system" | "light" | "dark";
export type FontSize = 1 | 2 | 3;

export interface Prefs {
  theme: Theme;
  fontSize: FontSize;
  notesOpen: boolean;
  lastLanguageMode: "mixed" | "zh" | "en";
  lastEngine: "web-speech" | "whisper";
  /** 使用者已看過隱私提示 */
  privacyAcknowledged: boolean;
  /** 校正規則總開關 */
  correctionsEnabled: boolean;
  /** 使用者已在快速模式看過「音訊由瀏覽器處理」提示 */
  fastModeNoticeSeen: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  fontSize: 2,
  notesOpen: true,
  lastLanguageMode: "mixed",
  lastEngine: "web-speech",
  privacyAcknowledged: false,
  correctionsEnabled: false,
  fastModeNoticeSeen: false,
};

const KEY = "casenote:prefs";

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 存不進去就算了，本次頁面仍用記憶體中的值 */
  }
  return next;
}

/** 把主題與字級寫到 <html>，CSS 靠 data 屬性切換 tokens */
export function applyPrefsToDocument(prefs: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && prefersDark);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.fontSize = String(prefs.fontSize);
}
