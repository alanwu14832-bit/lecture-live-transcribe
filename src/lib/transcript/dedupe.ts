/**
 * 相鄰音訊區塊有 overlap，Whisper 會把重疊的那一秒多講兩次。
 * 這裡找「前一段結尾」與「新段開頭」的最長共同部分，只保留新段沒講過的字。
 *
 * 比對時中英文一律先正規化（小寫、去空白與標點）再比，
 * 但切割位置對應回原始字串，所以輸出保留原本的大小寫與標點。
 */

const STRIP = /[\s\p{P}\p{S}]/u;

interface Tok { ch: string; idx: number }

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (STRIP.test(ch)) continue;
    out.push({ ch: ch.toLowerCase(), idx: i });
  }
  return out;
}

export interface MergeOptions {
  /** 最多回頭比對幾個正規化字元 */
  maxOverlap?: number;
  /** 至少要重疊幾個字元才算重複，避免單字巧合誤刪 */
  minOverlap?: number;
}

/** 回傳 next 裡尚未出現在 prev 結尾的部分 */
export function mergeOverlap(prev: string, next: string, opts: MergeOptions = {}): string {
  const maxOverlap = opts.maxOverlap ?? 60;
  const minOverlap = opts.minOverlap ?? 3;
  if (!prev || !next) return next.trim();
  const p = tokenize(prev).slice(-maxOverlap).map((t) => t.ch).join("");
  const n = tokenize(next);
  const nStr = n.map((t) => t.ch).join("");
  if (nStr.length === 0) return "";
  // 整段都已經在 prev 結尾出現過：這是純重複，丟掉
  if (nStr.length >= minOverlap && p.endsWith(nStr)) return "";
  const limit = Math.min(p.length, nStr.length, maxOverlap);
  for (let k = limit; k >= minOverlap; k--) {
    if (p.endsWith(nStr.slice(0, k))) {
      const cut = k < n.length ? n[k].idx : next.length;
      return next.slice(cut).replace(/^[\s\p{P}]+/u, "").trim();
    }
  }
  return next.trim();
}

/**
 * Whisper 在靜音或雜訊時常吐出這些「幻覺」句子，
 * 出現時整段丟掉。清單只放明顯的固定句，不做寬鬆比對。
 */
const HALLUCINATIONS = [
  "謝謝觀看", "謝謝收看", "請訂閱", "字幕由", "字幕製作", "感謝觀看",
  "thank you for watching", "thanks for watching", "subscribe", "[blank_audio]", "[music]", "(music)", "♪",
];

export function isLikelyHallucination(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (t.length <= 2) return true;
  return HALLUCINATIONS.some((h) => t.includes(h));
}
