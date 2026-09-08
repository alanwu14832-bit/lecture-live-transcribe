import { describe, expect, it } from "vitest";
import { isLikelyHallucination, mergeOverlap } from "./dedupe";

describe("mergeOverlap", () => {
  it("移除新段開頭與前段結尾重複的中文", () => {
    const prev = "我們今天要討論的是這家公司的資本結構";
    const next = "公司的資本結構跟它的 WACC 有什麼關係";
    expect(mergeOverlap(prev, next)).toBe("跟它的 WACC 有什麼關係");
  });

  it("移除重複的英文，忽略大小寫與標點", () => {
    const prev = "So the operating margin is improving,";
    const next = "operating margin is improving. But revenue growth slowed.";
    expect(mergeOverlap(prev, next)).toBe("But revenue growth slowed.");
  });

  it("沒有重疊時原樣回傳", () => {
    expect(mergeOverlap("第一段", "完全不同的第二段")).toBe("完全不同的第二段");
  });

  it("整段都是重複時回傳空字串", () => {
    expect(mergeOverlap("這是同一句話", "同一句話")).toBe("");
  });

  it("只有一兩個字巧合相同時不誤刪", () => {
    expect(mergeOverlap("今天講到這裡", "裡面還有一個重點")).toBe("裡面還有一個重點");
  });

  it("中英混合的重疊也能對上", () => {
    const prev = "如果 terminal growth rate 設太高";
    const next = "growth rate 設太高，DCF valuation 會失真";
    expect(mergeOverlap(prev, next)).toBe("DCF valuation 會失真");
  });
});

describe("isLikelyHallucination", () => {
  it("辨認常見的靜音幻覺句", () => {
    expect(isLikelyHallucination("謝謝觀看")).toBe(true);
    expect(isLikelyHallucination("Thank you for watching.")).toBe(true);
    expect(isLikelyHallucination("[BLANK_AUDIO]")).toBe(true);
    expect(isLikelyHallucination("")).toBe(true);
  });
  it("正常句子不會被當成幻覺", () => {
    expect(isLikelyHallucination("這家公司的 operating margin 比 industry average 高。")).toBe(false);
  });
});
