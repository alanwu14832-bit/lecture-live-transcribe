/**
 * 把逐句的 final 結果合併成容易閱讀的段落。
 * 規則：與上一段間隔不超過 gapSeconds、且上一段還沒太長，就併進上一段；
 * 否則另起新段。不會因為一個英文詞就切段。
 */
import type { DetectedLanguage, TranscriptSegment } from "../types";
import { newId, nowIso } from "../types";

export interface SegmentationOptions {
  /** 停頓超過這個秒數就另起新段 */
  gapSeconds?: number;
  /** 段落超過這個字數就另起新段，避免一整堂課變成一段 */
  maxChars?: number;
}

const CJK = /[㐀-鿿豈-﫿]/;

/** 中文接中文不加空格，其他情況加一個空格 */
export function joinText(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const last = a[a.length - 1];
  const first = b[0];
  const noSpace = CJK.test(last) && CJK.test(first);
  return noSpace ? a + b : `${a} ${b}`;
}

export function detectLanguage(text: string): DetectedLanguage {
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (cjk === 0 && latin === 0) return "unknown";
  if (cjk > 0 && latin >= 3) return "mixed";
  return cjk > 0 ? "zh" : "en";
}

export interface AppendResult {
  segments: TranscriptSegment[];
  /** 這次被新增或修改的那一段（要寫進 IndexedDB） */
  changed: TranscriptSegment;
  created: boolean;
}

export function appendFinal(
  segments: TranscriptSegment[],
  sessionId: string,
  text: string,
  timestamp: number,
  rawText: string | null,
  opts: SegmentationOptions = {},
): AppendResult {
  const gap = opts.gapSeconds ?? 2.5;
  const maxChars = opts.maxChars ?? 320;
  const clean = text.trim();
  const last = segments[segments.length - 1];
  const canMerge =
    last != null &&
    timestamp - last.endTimestamp <= gap &&
    last.text.length < maxChars &&
    // 使用者手動編輯過的段落不再自動併字進去
    !last.editedByUser;
  if (canMerge) {
    const merged: TranscriptSegment = {
      ...last,
      text: joinText(last.text, clean),
      rawText: last.rawText != null || rawText != null ? joinText(last.rawText ?? last.text, rawText ?? clean) : null,
      endTimestamp: timestamp,
      detectedLanguage: detectLanguage(joinText(last.text, clean)),
      // 併入新句子後舊譯文已經不完整，清掉讓翻譯層重做
      translation: null,
      updatedAt: nowIso(),
    };
    return { segments: [...segments.slice(0, -1), merged], changed: merged, created: false };
  }
  const t = nowIso();
  const seg: TranscriptSegment = {
    id: newId(),
    sessionId,
    text: clean,
    rawText,
    timestamp,
    endTimestamp: timestamp,
    detectedLanguage: detectLanguage(clean),
    translation: null,
    isBookmarked: false,
    editedByUser: false,
    createdAt: t,
    updatedAt: t,
  };
  return { segments: [...segments, seg], changed: seg, created: true };
}
