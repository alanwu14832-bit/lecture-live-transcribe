import { describe, expect, it } from "vitest";
import { appendFinal, detectLanguage, joinText } from "./segmentation";
import type { TranscriptSegment } from "../types";

describe("joinText", () => {
  it("中文接中文不加空格，其他情況加空格", () => {
    expect(joinText("今天講", "資本結構")).toBe("今天講資本結構");
    expect(joinText("今天講", "WACC")).toBe("今天講 WACC");
    expect(joinText("the WACC", "is high")).toBe("the WACC is high");
  });
});

describe("detectLanguage", () => {
  it("分辨中、英、混合", () => {
    expect(detectLanguage("資產負債表")).toBe("zh");
    expect(detectLanguage("discounted cash flow")).toBe("en");
    expect(detectLanguage("這個 strategy 的 CAC 太高")).toBe("mixed");
    expect(detectLanguage("123")).toBe("unknown");
  });
});

describe("appendFinal", () => {
  it("短時間內的連續句子合併成同一段", () => {
    let segs: TranscriptSegment[] = [];
    let r = appendFinal(segs, "s1", "第一句", 10, null);
    segs = r.segments;
    expect(r.created).toBe(true);
    r = appendFinal(segs, "s1", "第二句", 11.5, null);
    expect(r.created).toBe(false);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].text).toBe("第一句第二句");
    expect(r.segments[0].endTimestamp).toBe(11.5);
  });

  it("停頓超過門檻就另起新段", () => {
    const first = appendFinal([], "s1", "第一句", 10, null).segments;
    const r = appendFinal(first, "s1", "第二句", 14, null, { gapSeconds: 2.5 });
    expect(r.created).toBe(true);
    expect(r.segments).toHaveLength(2);
  });

  it("段落太長就另起新段", () => {
    const first = appendFinal([], "s1", "很長".repeat(200), 10, null).segments;
    const r = appendFinal(first, "s1", "下一句", 11, null, { maxChars: 100 });
    expect(r.created).toBe(true);
  });

  it("併入新句子後清掉舊譯文", () => {
    const first = appendFinal([], "s1", "第一句", 10, null).segments;
    first[0].translation = { lang: "en", text: "first" };
    const r = appendFinal(first, "s1", "第二句", 11, null);
    expect(r.segments[0].translation).toBeNull();
  });

  it("一個英文詞不會造成切段", () => {
    const first = appendFinal([], "s1", "這家公司的", 10, null).segments;
    const r = appendFinal(first, "s1", "EBITDA 很高", 10.8, null);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].text).toBe("這家公司的 EBITDA 很高");
  });
});

describe("appendFinal 與手動編輯", () => {
  it("使用者編輯過的段落不再併入新句子", () => {
    const first = appendFinal([], "s1", "第一句", 10, null).segments;
    first[0].editedByUser = true;
    const r = appendFinal(first, "s1", "第二句", 11, null);
    expect(r.created).toBe(true);
    expect(r.segments).toHaveLength(2);
  });
});
