/**
 * 匯出 TXT／Markdown。保留原始中英文、標點、段落與時間戳記，
 * 譯文與摘要提示詞都是選配，預設不附。
 */
import type { PersonalNote, Session, TranscriptSegment } from "./types";
import { LANGUAGE_MODE_LABELS, NOTE_TAG_LABELS } from "./types";

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} 小時 ${m} 分`;
  if (m > 0) return `${m} 分鐘`;
  return `${s} 秒`;
}

export interface ExportOptions {
  includeTranslation?: boolean;
  includeNotes?: boolean;
  includeSummaryPrompt?: boolean;
}

export const SUMMARY_PROMPT = `請根據上面的課堂逐字稿，用繁體中文整理：
1. 這堂課的三到五個核心觀念，每個用一兩句話說明
2. 出現的英文商業術語與它們在這堂課的意思
3. 教授強調或重複提到、可能是考點的地方
4. 我在筆記裡標成「不懂」的部分，請用簡單的例子解釋
保留原本的中英文用詞，不要把術語翻成中文。`;

function header(session: Session) {
  const date = new Date(session.startedAt ?? session.createdAt);
  return {
    date: date.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" }),
    mode: LANGUAGE_MODE_LABELS[session.languageMode],
    duration: formatDuration(session.duration),
  };
}

export function toMarkdown(session: Session, segments: TranscriptSegment[], notes: PersonalNote[], opts: ExportOptions = {}): string {
  const h = header(session);
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`${h.date} · ${h.mode} · ${h.duration}`);
  lines.push("");
  lines.push("## 逐字稿");
  lines.push("");
  for (const s of segments) {
    const mark = s.isBookmarked ? " ★" : "";
    lines.push(`**[${formatTimestamp(s.timestamp)}]**${mark} ${s.text}`);
    if (opts.includeTranslation && s.translation) lines.push(`> ${s.translation.text}`);
    lines.push("");
  }
  if (opts.includeNotes && notes.length > 0) {
    lines.push("## 我的筆記");
    lines.push("");
    for (const n of notes) {
      const tag = n.tag ? `[${NOTE_TAG_LABELS[n.tag]}] ` : "";
      lines.push(`- [${formatTimestamp(n.timestamp)}] ${tag}${n.text}`);
    }
    lines.push("");
  }
  if (opts.includeSummaryPrompt) {
    lines.push("---");
    lines.push("");
    lines.push(SUMMARY_PROMPT);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function toTxt(session: Session, segments: TranscriptSegment[], notes: PersonalNote[], opts: ExportOptions = {}): string {
  const h = header(session);
  const lines: string[] = [];
  lines.push(session.title);
  lines.push(`${h.date} · ${h.mode} · ${h.duration}`);
  lines.push("");
  for (const s of segments) {
    lines.push(`[${formatTimestamp(s.timestamp)}]${s.isBookmarked ? " ★" : ""} ${s.text}`);
    if (opts.includeTranslation && s.translation) lines.push(`    ${s.translation.text}`);
    lines.push("");
  }
  if (opts.includeNotes && notes.length > 0) {
    lines.push("我的筆記");
    for (const n of notes) {
      const tag = n.tag ? `[${NOTE_TAG_LABELS[n.tag]}] ` : "";
      lines.push(`[${formatTimestamp(n.timestamp)}] ${tag}${n.text}`);
    }
    lines.push("");
  }
  if (opts.includeSummaryPrompt) {
    lines.push("----");
    lines.push(SUMMARY_PROMPT);
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "_").trim() || "casenote";
}

/** 下載檔案。用 Blob URL，不經過任何伺服器。 */
export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
