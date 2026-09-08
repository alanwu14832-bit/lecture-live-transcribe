/**
 * 校正規則：使用者自己建立的「聽錯 → 正確」對應。
 * 只套用在 final 文字、替換處會被標示、可以還原；沒有規則就什麼都不改。
 */
import type { CorrectionRule } from "../types";

export interface CorrectionResult {
  text: string;
  changed: boolean;
  applied: Array<{ from: string; to: string }>;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LATIN = /^[A-Za-z0-9 .'\-]+$/;

export function applyRules(text: string, rules: CorrectionRule[]): CorrectionResult {
  let out = text;
  const applied: Array<{ from: string; to: string }> = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const from = rule.from.trim();
    if (!from) continue;
    // 英文詞要整字比對且不分大小寫，中文直接子字串比對
    const re = LATIN.test(from)
      ? new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(from)}(?![A-Za-z0-9])`, "gi")
      : new RegExp(escapeRegExp(from), "g");
    if (re.test(out)) {
      out = out.replace(re, rule.to);
      applied.push({ from, to: rule.to });
    }
  }
  return { text: out, changed: applied.length > 0, applied };
}

/** 內建建議清單。預設全部關閉，使用者要自己打開。 */
export const SUGGESTED_RULES: Array<{ from: string; to: string }> = [
  { from: "安批威", to: "NPV" },
  { from: "一比達", to: "EBITDA" },
  { from: "一逼達", to: "EBITDA" },
  { from: "瓦克", to: "WACC" },
  { from: "滴西夫", to: "DCF" },
  { from: "愛阿阿", to: "IRR" },
  { from: "凱噴", to: "CAPM" },
  { from: "roi", to: "ROI" },
  { from: "ebitda", to: "EBITDA" },
  { from: "wacc", to: "WACC" },
  { from: "dcf", to: "DCF" },
  { from: "npv", to: "NPV" },
  { from: "irr", to: "IRR" },
];

/**
 * 從一次手動編輯推測規則。只在改動很局部時才建議，
 * 整段重寫不會產生規則，避免把長句子當成替換來源。
 */
export function suggestRuleFromEdit(before: string, after: string): { from: string; to: string } | null {
  if (before === after) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  const from = before.slice(start, endB).trim();
  const to = after.slice(start, endA).trim();
  if (!from || !to) return null;
  // 來源太長代表是整句重寫而不是聽錯一個詞；目標放寬一點讓英文片語（如 customer acquisition cost）進得來
  if (from.length > 20 || to.length > 30) return null;
  if (from.length > before.length / 2) return null;
  return { from, to };
}

/** 把一段套用過規則的文字切成「原樣／被替換」片段，給 UI 標示用 */
export function highlightReplacements(text: string, applied: Array<{ from: string; to: string }>): Array<{ text: string; from?: string }> {
  if (applied.length === 0) return [{ text }];
  const targets = applied.map((a) => a.to).filter(Boolean);
  if (targets.length === 0) return [{ text }];
  const re = new RegExp(`(${targets.map(escapeRegExp).join("|")})`, "g");
  const parts: Array<{ text: string; from?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i) });
    const hit = applied.find((a) => a.to === m[0]);
    parts.push({ text: m[0], from: hit?.from });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
