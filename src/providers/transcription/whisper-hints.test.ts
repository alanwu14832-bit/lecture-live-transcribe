import { describe, expect, it } from "vitest";
import { buildWhisperPrompt, needsTraditionalConversion, whisperLanguageFor } from "./whisper-hints";

describe("whisperLanguageFor", () => {
  it("中文為主與中英混合都用 zh，English-first 用 en", () => {
    expect(whisperLanguageFor("zh")).toBe("zh");
    expect(whisperLanguageFor("mixed")).toBe("zh");
    expect(whisperLanguageFor("en")).toBe("en");
  });
});

describe("buildWhisperPrompt", () => {
  it("沒有詞彙就沒有提示", () => {
    expect(buildWhisperPrompt([], "zh")).toBe("");
    expect(buildWhisperPrompt(["  ", ""], "zh")).toBe("");
  });
  it("寫成自然句子並去重、去空白", () => {
    expect(buildWhisperPrompt(["WACC", " EBITDA ", "wacc", "資產負債表"], "zh")).toBe("商學院課堂，常用術語：WACC, EBITDA, 資產負債表。");
    expect(buildWhisperPrompt(["WACC"], "en")).toBe("Business school lecture. Key terms: WACC.");
  });
  it("超過長度上限時整個詞截掉，不切半", () => {
    const many = Array.from({ length: 60 }, (_, i) => `terminal growth rate ${i}`);
    const p = buildWhisperPrompt(many, "zh", 100);
    expect(p.length).toBeLessThanOrEqual(101);
    expect(p.endsWith("。")).toBe(true);
    expect(p).not.toMatch(/terminal growth rate \d*$/);
    expect(p).toContain("terminal growth rate 0");
  });
});

describe("needsTraditionalConversion", () => {
  it("只有含中文字才轉", () => {
    expect(needsTraditionalConversion("operating margin is high")).toBe(false);
    expect(needsTraditionalConversion("这家公司的 margin 很高")).toBe(true);
  });
});
