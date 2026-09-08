/**
 * 資料模型。所有資料只存在使用者裝置（IndexedDB），不存原始音訊。
 * 時間欄位一律 ISO 字串（createdAt 等）或「距課堂開始的秒數」（timestamp）。
 */

export type LanguageMode = "mixed" | "zh" | "en";
export type Engine = "web-speech" | "whisper";
export type SessionStatus = "draft" | "live" | "ended";
export type DetectedLanguage = "zh" | "en" | "mixed" | "unknown";

export interface Session {
  id: string;
  title: string;
  languageMode: LanguageMode;
  transcriptionEngine: Engine;
  translationEnabled: boolean;
  notesOpen: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /** 累計轉錄秒數（不含暫停） */
  duration: number;
  status: SessionStatus;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  text: string;
  /** 套用校正規則前的原始辨識結果；沒套用時為 null */
  rawText: string | null;
  /** 段落開始，距課堂開始秒數 */
  timestamp: number;
  /** 段落最後一句定稿的時間，用來判斷要不要另起新段 */
  endTimestamp: number;
  detectedLanguage: DetectedLanguage;
  translation: { lang: "zh" | "en"; text: string } | null;
  isBookmarked: boolean;
  /** 使用者手動編輯過；之後的新句子不再自動併進這一段 */
  editedByUser: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NoteTag = "exam" | "unclear" | "case" | "review" | null;

export interface PersonalNote {
  id: string;
  sessionId: string;
  text: string;
  tag: NoteTag;
  /** 記下筆記時的課堂秒數 */
  timestamp: number;
  referencedSegmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  /** null 代表全域詞彙 */
  sessionId: string | null;
  createdAt: string;
}

export interface CorrectionRule {
  id: string;
  from: string;
  to: string;
  enabled: boolean;
  createdAt: string;
}

export const NOTE_TAG_LABELS: Record<Exclude<NoteTag, null>, string> = {
  exam: "考試重點",
  unclear: "不懂",
  case: "個案",
  review: "待複習",
};

export const LANGUAGE_MODE_LABELS: Record<LanguageMode, string> = {
  mixed: "中英混合",
  zh: "中文為主",
  en: "English-first",
};

export const ENGINE_LABELS: Record<Engine, string> = {
  "web-speech": "快速模式",
  whisper: "本機雙語辨識",
};

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
