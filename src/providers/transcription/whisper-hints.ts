/**
 * 給本機 Whisper 的兩種提示：
 * 1. 語言：課堂建立時選的語言模式 → Whisper 的語言 token，避免每個音訊區塊各自猜語言而飄來飄去。
 * 2. 詞彙：課程詞彙表 → 當作「前文」餵給模型，提高 WACC、EBITDA 這類專有名詞的拼對率。
 * 這兩個都只是提示，模型仍然會照實際聽到的內容輸出中英文。
 */
import type { LanguageMode } from "@/lib/types";

export type WhisperLanguage = "zh" | "en";

/** 中英混合以中文為主要語言：Whisper 在 zh 模式下遇到英文詞通常仍會照英文寫出來 */
export function whisperLanguageFor(mode: LanguageMode): WhisperLanguage {
  return mode === "en" ? "en" : "zh";
}

/** Whisper 的前文提示上限約 224 個 token；中英混合大約 1 個 token 對 1–2 個字元，保守抓 220 字元 */
export const PROMPT_MAX_CHARS = 220;

/**
 * 把詞彙表寫成像「上一段逐字稿」的自然句子。
 * 逗號分隔、以句號結尾是 Whisper 官方建議的 prompt 寫法；超過上限就從後面截掉整個詞，不切半個詞。
 */
export function buildWhisperPrompt(phrases: string[], language: WhisperLanguage, maxChars = PROMPT_MAX_CHARS): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const p of phrases) {
    const t = p.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(t);
  }
  if (terms.length === 0) return "";
  const lead = language === "en" ? "Business school lecture. Key terms: " : "商學院課堂，常用術語：";
  let out = lead;
  for (let i = 0; i < terms.length; i++) {
    const piece = (i === 0 ? "" : ", ") + terms[i];
    if (out.length + piece.length + 1 > maxChars) break;
    out += piece;
  }
  if (out === lead) return "";
  return out + (language === "en" ? "." : "。");
}

/** 輸出裡有中文字才需要簡轉繁；全英文區塊直接略過，省一次字典查表 */
export function needsTraditionalConversion(text: string): boolean {
  return /[㐀-鿿]/.test(text);
}
