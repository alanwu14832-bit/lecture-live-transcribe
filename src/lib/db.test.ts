import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as db from "./db";
import type { TranscriptSegment } from "./types";

beforeEach(async () => {
  await db.resetDbForTests();
  // 每個測試用全新的 IndexedDB，模擬「重新整理頁面」時也只換連線不換資料
  globalThis.indexedDB = new IDBFactory();
});

function seg(sessionId: string, text: string, t: number): TranscriptSegment {
  return { id: `${sessionId}-${t}`, sessionId, text, rawText: null, timestamp: t, endTimestamp: t, detectedLanguage: "zh", translation: null, isBookmarked: false, editedByUser: false, createdAt: "", updatedAt: "" };
}

describe("IndexedDB repository", () => {
  it("建立課堂、寫入逐字稿，重新開啟連線後還在", async () => {
    const s = await db.createSession({ title: "財管", languageMode: "mixed", transcriptionEngine: "web-speech", notesOpen: true });
    await db.putSegment(seg(s.id, "第一段", 1));
    await db.putSegment(seg(s.id, "第二段", 2));
    await db.resetDbForTests(); // 模擬頁面重新整理
    const got = await db.getSession(s.id);
    expect(got?.title).toBe("財管");
    const segs = await db.listSegments(s.id);
    expect(segs.map((x) => x.text)).toEqual(["第一段", "第二段"]);
  });

  it("空標題會變成未命名課堂", async () => {
    const s = await db.createSession({ title: "   ", languageMode: "zh", transcriptionEngine: "web-speech", notesOpen: false });
    expect(s.title).toBe("未命名課堂");
  });

  it("刪除課堂會連帶刪掉它的逐字稿與筆記，但不動別的課堂", async () => {
    const a = await db.createSession({ title: "A", languageMode: "mixed", transcriptionEngine: "web-speech", notesOpen: true });
    const b = await db.createSession({ title: "B", languageMode: "mixed", transcriptionEngine: "web-speech", notesOpen: true });
    await db.putSegment(seg(a.id, "a1", 1));
    await db.putSegment(seg(b.id, "b1", 1));
    await db.putNote({ id: "n1", sessionId: a.id, text: "x", tag: null, timestamp: 0, referencedSegmentId: null, createdAt: "", updatedAt: "" });
    await db.deleteSession(a.id);
    expect(await db.getSession(a.id)).toBeUndefined();
    expect(await db.listSegments(a.id)).toEqual([]);
    expect(await db.listNotes(a.id)).toEqual([]);
    expect((await db.listSegments(b.id)).length).toBe(1);
  });

  it("課堂列表依更新時間新到舊", async () => {
    const a = await db.createSession({ title: "A", languageMode: "mixed", transcriptionEngine: "web-speech", notesOpen: true });
    await new Promise((r) => setTimeout(r, 5));
    const b = await db.createSession({ title: "B", languageMode: "mixed", transcriptionEngine: "web-speech", notesOpen: true });
    const list = await db.listSessions();
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("預設詞彙表第一次讀取時會建立，且不重複加入", async () => {
    const g = await db.listGlossary();
    expect(g.some((t) => t.term === "EBITDA")).toBe(true);
    expect(await db.addGlossaryTerm("ebitda", null)).toBeNull();
    const added = await db.addGlossaryTerm("switching cost", null);
    expect(added?.sessionId).toBeNull();
    expect((await db.listGlossary()).length).toBe(g.length + 1);
  });

  it("只在完全沒有課堂時才建立示範課堂", async () => {
    await db.seedDemoIfEmpty();
    const first = await db.listSessions();
    expect(first).toHaveLength(1);
    expect(first[0].title.startsWith("示範")).toBe(true);
    await db.seedDemoIfEmpty();
    expect(await db.listSessions()).toHaveLength(1);
  });
});
