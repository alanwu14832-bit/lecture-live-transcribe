/**
 * IndexedDB repository。所有課堂資料只存這裡。
 *
 * 為什麼用 IndexedDB 不用 localStorage：逐字稿、筆記、詞彙、規則是多張表，
 * 一堂三小時的課加上譯文可能超過 localStorage 的容量，而且要能依 sessionId 查詢。
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CorrectionRule, GlossaryTerm, PersonalNote, Session, TranscriptSegment } from "./types";
import { newId, nowIso } from "./types";

interface CaseNoteDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { byUpdatedAt: string } };
  segments: { key: string; value: TranscriptSegment; indexes: { bySession: string } };
  notes: { key: string; value: PersonalNote; indexes: { bySession: string } };
  glossary: { key: string; value: GlossaryTerm; indexes: { bySession: string } };
  rules: { key: string; value: CorrectionRule };
}

const DB_NAME = "casenote";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CaseNoteDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<CaseNoteDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("byUpdatedAt", "updatedAt");
        const segments = db.createObjectStore("segments", { keyPath: "id" });
        segments.createIndex("bySession", "sessionId");
        const notes = db.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("bySession", "sessionId");
        const glossary = db.createObjectStore("glossary", { keyPath: "id" });
        glossary.createIndex("bySession", "sessionId");
        db.createObjectStore("rules", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

/** 測試用：關掉連線讓下一次重新開啟 */
export async function resetDbForTests() {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
}

// ---------- sessions ----------

export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("sessions", "byUpdatedAt");
  return all.reverse();
}

export async function getSession(id: string): Promise<Session | undefined> {
  return (await getDb()).get("sessions", id);
}

export async function createSession(input: Pick<Session, "title" | "languageMode" | "transcriptionEngine" | "notesOpen">): Promise<Session> {
  const t = nowIso();
  const session: Session = {
    id: newId(),
    title: input.title.trim() || "未命名課堂",
    languageMode: input.languageMode,
    transcriptionEngine: input.transcriptionEngine,
    translationEnabled: false,
    notesOpen: input.notesOpen,
    createdAt: t,
    updatedAt: t,
    startedAt: null,
    endedAt: null,
    duration: 0,
    status: "draft",
  };
  await (await getDb()).put("sessions", session);
  return session;
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<Session | undefined> {
  const db = await getDb();
  const tx = db.transaction("sessions", "readwrite");
  const current = await tx.store.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch, id, updatedAt: nowIso() };
  await tx.store.put(next);
  await tx.done;
  return next;
}

/** 刪除課堂與其所有逐字稿、筆記、課堂專屬詞彙。這是唯一會丟資料的操作。 */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["sessions", "segments", "notes", "glossary"], "readwrite");
  await tx.objectStore("sessions").delete(id);
  for (const store of ["segments", "notes", "glossary"] as const) {
    const keys = await tx.objectStore(store).index("bySession").getAllKeys(id);
    for (const k of keys) await tx.objectStore(store).delete(k);
  }
  await tx.done;
}

// ---------- segments ----------

export async function listSegments(sessionId: string): Promise<TranscriptSegment[]> {
  const rows = await (await getDb()).getAllFromIndex("segments", "bySession", sessionId);
  return rows.sort((a, b) => a.timestamp - b.timestamp || a.createdAt.localeCompare(b.createdAt));
}

export async function putSegment(segment: TranscriptSegment): Promise<void> {
  await (await getDb()).put("segments", { ...segment, updatedAt: nowIso() });
}

export async function putSegments(segments: TranscriptSegment[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("segments", "readwrite");
  for (const s of segments) await tx.store.put(s);
  await tx.done;
}

export async function deleteSegment(id: string): Promise<void> {
  await (await getDb()).delete("segments", id);
}

// ---------- notes ----------

export async function listNotes(sessionId: string): Promise<PersonalNote[]> {
  const rows = await (await getDb()).getAllFromIndex("notes", "bySession", sessionId);
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function putNote(note: PersonalNote): Promise<void> {
  await (await getDb()).put("notes", { ...note, updatedAt: nowIso() });
}

export async function deleteNote(id: string): Promise<void> {
  await (await getDb()).delete("notes", id);
}

// ---------- glossary ----------

export const DEFAULT_GLOSSARY = [
  "EBITDA", "WACC", "DCF", "NPV", "IRR",
  "discounted cash flow", "net present value", "enterprise value",
  "operating margin", "customer acquisition cost", "lifetime value",
  "network effect", "market segmentation", "Porter's Five Forces",
  "資產負債表", "現金流量表", "邊際成本", "機會成本", "公司治理", "規模經濟",
];

/** 全域詞彙 + 課堂專屬詞彙。第一次呼叫時把預設詞彙寫進去。 */
export async function listGlossary(sessionId?: string): Promise<GlossaryTerm[]> {
  const db = await getDb();
  let global = await db.getAllFromIndex("glossary", "bySession", "");
  if (global.length === 0) {
    const t = nowIso();
    const tx = db.transaction("glossary", "readwrite");
    for (const term of DEFAULT_GLOSSARY) {
      await tx.store.put({ id: newId(), term, sessionId: "", createdAt: t });
    }
    await tx.done;
    global = await db.getAllFromIndex("glossary", "bySession", "");
  }
  const local = sessionId ? await db.getAllFromIndex("glossary", "bySession", sessionId) : [];
  return [...global, ...local].map((g) => ({ ...g, sessionId: g.sessionId || null }));
}

export async function addGlossaryTerm(term: string, sessionId: string | null): Promise<GlossaryTerm | null> {
  const clean = term.trim();
  if (!clean) return null;
  const existing = await listGlossary(sessionId ?? undefined);
  if (existing.some((g) => g.term.toLowerCase() === clean.toLowerCase())) return null;
  // IndexedDB 的索引不接受 null，所以全域詞彙用空字串當 sessionId
  const row: GlossaryTerm = { id: newId(), term: clean, sessionId: sessionId ?? "", createdAt: nowIso() };
  await (await getDb()).put("glossary", row);
  return { ...row, sessionId };
}

export async function deleteGlossaryTerm(id: string): Promise<void> {
  await (await getDb()).delete("glossary", id);
}

// ---------- correction rules ----------

export async function listRules(): Promise<CorrectionRule[]> {
  const rows = await (await getDb()).getAll("rules");
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function putRule(rule: CorrectionRule): Promise<void> {
  await (await getDb()).put("rules", rule);
}

export async function deleteRule(id: string): Promise<void> {
  await (await getDb()).delete("rules", id);
}

/** 只在資料庫完全沒有任何課堂時才建立示範課堂，讓第一次打開的人看到產品長什麼樣。 */
export async function seedDemoIfEmpty(): Promise<void> {
  const db = await getDb();
  if ((await db.count("sessions")) > 0) return;
  const { buildDemoSession } = await import("./demo");
  const { session, segments, notes } = buildDemoSession();
  const tx = db.transaction(["sessions", "segments", "notes"], "readwrite");
  await tx.objectStore("sessions").put(session);
  for (const s of segments) await tx.objectStore("segments").put(s);
  for (const n of notes) await tx.objectStore("notes").put(n);
  await tx.done;
}
