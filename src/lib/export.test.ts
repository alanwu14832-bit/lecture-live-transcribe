import { describe, expect, it } from "vitest";
import { formatDuration, formatTimestamp, safeFilename, toMarkdown, toTxt } from "./export";
import type { PersonalNote, Session, TranscriptSegment } from "./types";

const session: Session = {
  id: "s", title: "財務管理 W3", languageMode: "mixed", transcriptionEngine: "web-speech", translationEnabled: false, notesOpen: true,
  createdAt: "2026-09-08T02:00:00.000Z", updatedAt: "", startedAt: "2026-09-08T02:00:00.000Z", endedAt: null, duration: 3725, status: "ended",
};
const segments: TranscriptSegment[] = [
  { id: "a", sessionId: "s", text: "這家公司的 EBITDA 很高。", rawText: null, timestamp: 65, endTimestamp: 70, detectedLanguage: "mixed", translation: { lang: "en", text: "This company's EBITDA is high." }, isBookmarked: true, editedByUser: false, createdAt: "", updatedAt: "" },
  { id: "b", sessionId: "s", text: "接下來算 WACC。", rawText: null, timestamp: 3700, endTimestamp: 3705, detectedLanguage: "mixed", translation: null, isBookmarked: false, editedByUser: false, createdAt: "", updatedAt: "" },
];
const notes: PersonalNote[] = [
  { id: "n", sessionId: "s", text: "考試重點", tag: "exam", timestamp: 66, referencedSegmentId: "a", createdAt: "", updatedAt: "" },
];

describe("format helpers", () => {
  it("時間戳超過一小時才顯示小時", () => {
    expect(formatTimestamp(65)).toBe("01:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
  it("時長用人話", () => {
    expect(formatDuration(3725)).toBe("1 小時 2 分");
    expect(formatDuration(120)).toBe("2 分鐘");
  });
  it("檔名去掉不合法字元", () => {
    expect(safeFilename("財管: W3/期中")).toBe("財管_ W3_期中");
  });
});

describe("toMarkdown", () => {
  it("保留原文、大小寫、時間戳與標記，預設不附譯文與筆記", () => {
    const md = toMarkdown(session, segments, notes);
    expect(md).toContain("# 財務管理 W3");
    expect(md).toContain("**[01:05]** ★ 這家公司的 EBITDA 很高。");
    expect(md).toContain("**[1:01:40]** 接下來算 WACC。");
    expect(md).not.toContain("This company's EBITDA");
    expect(md).not.toContain("我的筆記");
  });
  it("選配附上譯文、筆記與摘要提示詞", () => {
    const md = toMarkdown(session, segments, notes, { includeTranslation: true, includeNotes: true, includeSummaryPrompt: true });
    expect(md).toContain("> This company's EBITDA is high.");
    expect(md).toContain("- [01:06] [考試重點] 考試重點");
    expect(md).toContain("請根據上面的課堂逐字稿");
  });
});

describe("toTxt", () => {
  it("純文字有標題、時間戳與內容", () => {
    const txt = toTxt(session, segments, notes);
    expect(txt.startsWith("財務管理 W3\n")).toBe(true);
    expect(txt).toContain("[01:05] ★ 這家公司的 EBITDA 很高。");
  });
});
