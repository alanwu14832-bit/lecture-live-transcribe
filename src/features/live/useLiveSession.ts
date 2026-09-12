"use client";
/**
 * 即時課堂的控制中樞：把狀態機、麥克風、轉錄引擎、校正規則、翻譯、IndexedDB 串起來。
 * UI 只讀這裡回傳的狀態、呼叫這裡的動作，不直接碰任何引擎。
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { usePrefs } from "@/components/PrefsProvider";
import { createLevelMeter, openMicrophone, stopStream, type LevelMeter } from "@/lib/audio/mic";
import { WORKLET_URL } from "@/lib/basePath";
import { detectCapabilities, type Capabilities } from "@/lib/capability";
import * as db from "@/lib/db";
import { ERRORS, mapMediaError, type AppError } from "@/lib/errors";
import { initialMachineState, isActive, transition, type MachineState } from "@/lib/session-machine";
import { applyRules } from "@/lib/transcript/corrections";
import { appendFinal, detectLanguage } from "@/lib/transcript/segmentation";
import type { CorrectionRule, GlossaryTerm, NoteTag, PersonalNote, Session, TranscriptSegment } from "@/lib/types";
import { newId, nowIso } from "@/lib/types";
import type { ModelProgress, TranscriptionEvent, TranscriptionProvider } from "@/providers/transcription/types";
import { WebSpeechProvider } from "@/providers/transcription/web-speech";
import { GroqProvider } from "@/providers/transcription/groq";
import { loadGroqKey } from "@/lib/prefs";
import { isWhisperModelCached, WhisperProvider } from "@/providers/transcription/whisper";
import { createChromeTranslation, type TranslationProvider } from "@/providers/translation/chrome";

export type SaveState = "saved" | "saving" | "failed";

export interface LiveController {
  session: Session | null | undefined;
  machine: MachineState;
  segments: TranscriptSegment[];
  interim: string;
  elapsed: number;
  saveState: SaveState;
  storageError: AppError | null;
  backgrounded: boolean;
  offline: boolean;
  lagNotice: boolean;
  modelProgress: ModelProgress | null;
  needsModelDownload: boolean;
  caps: Capabilities | null;
  levelRef: React.MutableRefObject<number>;
  notes: PersonalNote[];
  glossary: GlossaryTerm[];
  rules: CorrectionRule[];
  translationSupported: boolean;
  translationProgress: number | null;
  // actions
  downloadModel(): void;
  cancelDownload(): void;
  switchToFast(): void;
  retry(): void;
  pause(): void;
  resume(): void;
  end(): Promise<void>;
  saveNow(): Promise<void>;
  setTitle(title: string): void;
  setLanguageMode(mode: Session["languageMode"]): void;
  setTranslationEnabled(on: boolean): void;
  updateSegmentText(id: string, text: string): Promise<void>;
  toggleBookmark(id: string): Promise<void>;
  restoreSegmentRaw(id: string): Promise<void>;
  addNote(text: string, tag: NoteTag, referencedSegmentId: string | null): Promise<void>;
  updateNote(id: string, patch: Partial<PersonalNote>): Promise<void>;
  deleteNote(id: string): Promise<void>;
  addGlossary(term: string): Promise<void>;
  removeGlossary(id: string): Promise<void>;
  addRule(from: string, to: string, enabled?: boolean): Promise<void>;
  toggleRule(id: string, enabled: boolean): Promise<void>;
  removeRule(id: string): Promise<void>;
  dismissLag(): void;
}

export function useLiveSession(sessionId: string | null): LiveController {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [machine, dispatch] = useReducer(transition, initialMachineState);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [storageError, setStorageError] = useState<AppError | null>(null);
  const [backgrounded, setBackgrounded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lagNotice, setLagNotice] = useState(false);
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [needsModelDownload, setNeedsModelDownload] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [rules, setRules] = useState<CorrectionRule[]>([]);
  const [translationSupported, setTranslationSupported] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<number | null>(null);

  const levelRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const machineRef = useRef(machine);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const rulesRef = useRef<CorrectionRule[]>([]);
  const glossaryRef = useRef<GlossaryTerm[]>([]);
  const prefsRef = useRef(prefs);
  const providerRef = useRef<TranscriptionProvider | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const translationRef = useRef<TranslationProvider | null>(null);
  const timing = useRef({ accumulated: 0, runStartMs: null as number | null });
  const beginning = useRef(false);
  const endedRef = useRef(false);

  machineRef.current = machine;
  segmentsRef.current = segments;
  rulesRef.current = rules;
  glossaryRef.current = glossary;
  prefsRef.current = prefs;
  sessionRef.current = session ?? null;

  const activeSecondsAt = useCallback((ms: number) => {
    const t = timing.current;
    return t.accumulated + (t.runStartMs != null ? Math.max(0, ms - t.runStartMs) / 1000 : 0);
  }, []);

  const startClock = useCallback(() => {
    if (timing.current.runStartMs == null) timing.current.runStartMs = Date.now();
  }, []);

  const stopClock = useCallback(() => {
    const t = timing.current;
    if (t.runStartMs != null) {
      t.accumulated += (Date.now() - t.runStartMs) / 1000;
      t.runStartMs = null;
    }
  }, []);

  // ---------- 儲存 ----------

  const persistSegment = useCallback(async (seg: TranscriptSegment) => {
    setSaveState("saving");
    try {
      await db.putSegment(seg);
      setSaveState("saved");
      setStorageError(null);
    } catch {
      setSaveState("failed");
      setStorageError(ERRORS.storageFailed());
    }
  }, []);

  const persistSession = useCallback(async (patch: Partial<Session>) => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      const next = await db.updateSession(s.id, patch);
      if (next) {
        sessionRef.current = next;
        setSession(next);
      }
    } catch {
      setStorageError(ERRORS.storageFailed());
    }
  }, []);

  // ---------- 翻譯 ----------

  const translateSegment = useCallback(async (seg: TranscriptSegment) => {
    const t = translationRef.current;
    if (!t || !sessionRef.current?.translationEnabled) return;
    if (seg.translation || !seg.text.trim()) return;
    try {
      const result = await t.translate(seg.text, seg.detectedLanguage);
      if (!result) return;
      const current = segmentsRef.current.find((x) => x.id === seg.id);
      // 翻譯期間段落可能又被併入新句子，那就不要把舊譯文貼上去
      if (!current || current.text !== seg.text) return;
      const updated = { ...current, translation: result };
      setSegments((prev) => prev.map((x) => (x.id === seg.id ? updated : x)));
      await db.putSegment(updated);
    } catch {
      /* 翻譯失敗不影響逐字稿 */
    }
  }, []);

  // ---------- 引擎事件 ----------

  const handleFinal = useCallback(
    async (text: string, atMs: number) => {
      const s = sessionRef.current;
      if (!s) return;
      let final = text;
      let raw: string | null = null;
      if (prefsRef.current.correctionsEnabled) {
        const r = applyRules(text, rulesRef.current);
        if (r.changed) {
          final = r.text;
          raw = text;
        }
      }
      const ts = activeSecondsAt(atMs);
      const result = appendFinal(segmentsRef.current, s.id, final, ts, raw);
      segmentsRef.current = result.segments;
      setSegments(result.segments);
      await persistSegment(result.changed);
      // 前一段已經定型，這時候翻譯才不會白做
      if (result.created && result.segments.length >= 2) void translateSegment(result.segments[result.segments.length - 2]);
    },
    [activeSecondsAt, persistSegment, translateSegment],
  );

  const onProviderEvent = useCallback(
    (e: TranscriptionEvent) => {
      switch (e.type) {
        case "interim":
          setInterim(e.text);
          break;
        case "final":
          void handleFinal(e.text, e.atMs);
          break;
        case "processing":
          dispatch({ type: "PROCESSING", busy: e.busy });
          break;
        case "dropped":
          if (e.reason === "backlog") setLagNotice(true);
          else dispatch({ type: "ENGINE_DROPPED" });
          break;
        case "recovered":
          dispatch({ type: "RECOVERED" });
          break;
        case "model-progress":
          setModelProgress(e.progress);
          break;
        case "error":
          stopClock();
          dispatch({ type: "FAIL", error: e.error });
          break;
      }
    },
    [handleFinal, stopClock],
  );

  // ---------- 啟動流程 ----------

  const teardownEngine = useCallback(async () => {
    const p = providerRef.current;
    providerRef.current = null;
    if (p) await p.stop().catch(() => {});
    meterRef.current?.stop();
    meterRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setInterim("");
  }, []);

  const capsRef = useRef<Capabilities | null>(null);

  const startEngine = useCallback(async () => {
    const s = sessionRef.current;
    const stream = streamRef.current;
    const c = capsRef.current;
    if (!s || !stream) return;
    const provider: TranscriptionProvider =
      s.transcriptionEngine === "whisper"
        ? providerRef.current instanceof WhisperProvider
          ? providerRef.current
          : new WhisperProvider({ device: c?.webgpu ? "webgpu" : "wasm", workletUrl: WORKLET_URL })
        : s.transcriptionEngine === "groq"
          ? new GroqProvider({ apiKey: loadGroqKey(), workletUrl: WORKLET_URL })
          : new WebSpeechProvider();
    providerRef.current = provider;
    provider.subscribe(onProviderEvent);
    try {
      await provider.start({ stream, languageMode: s.languageMode, phrases: glossaryRef.current.map((g) => g.term) });
    } catch {
      return; // provider 已經發出 error 事件
    }
    dispatch({ type: "START" });
    startClock();
    if (s.status === "draft") void persistSession({ status: "live", startedAt: nowIso() });
  }, [onProviderEvent, persistSession, startClock]);

  const begin = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || beginning.current || endedRef.current) return;
    beginning.current = true;
    try {
      dispatch({ type: "CHECK" });
      const c = await detectCapabilities();
      capsRef.current = c;
      setCaps(c);
      if (!c.secureContext) {
        dispatch({ type: "FAIL", error: ERRORS.insecureContext() });
        return;
      }
      if (s.transcriptionEngine === "web-speech" && !c.speechRecognition) {
        dispatch({ type: "FAIL", error: ERRORS.speechUnsupported() });
        return;
      }
      if (s.transcriptionEngine === "groq" && !loadGroqKey()) {
        dispatch({ type: "FAIL", error: ERRORS.groqKeyMissing() });
        return;
      }
      dispatch({ type: "REQUEST_PERMISSION" });
      try {
        const stream = await openMicrophone();
        streamRef.current = stream;
        meterRef.current = createLevelMeter(stream);
      } catch (err) {
        dispatch({ type: "FAIL", error: mapMediaError(err) });
        return;
      }
      let needsModel = false;
      if (s.transcriptionEngine === "whisper") {
        const device = c.webgpu ? "webgpu" : "wasm";
        const provider = new WhisperProvider({ device, workletUrl: WORKLET_URL });
        providerRef.current = provider;
        needsModel = !(await isWhisperModelCached(provider.model));
      }
      setNeedsModelDownload(needsModel);
      dispatch({ type: "PERMISSION_GRANTED", needsModel });
      if (!needsModel) await startEngine();
    } finally {
      beginning.current = false;
    }
  }, [startEngine]);

  const downloadModel = useCallback(async () => {
    const p = providerRef.current;
    if (!(p instanceof WhisperProvider)) return;
    const unsubscribe = p.subscribe((e) => {
      if (e.type === "model-progress") setModelProgress(e.progress);
    });
    try {
      await p.loadModel();
      unsubscribe();
      setNeedsModelDownload(false);
      dispatch({ type: "MODEL_READY" });
      await startEngine();
    } catch (err) {
      unsubscribe();
      dispatch({ type: "FAIL", error: ERRORS.modelLoadFailed((err as Error)?.message ?? "") });
    }
  }, [startEngine]);

  const cancelDownload = useCallback(() => {
    const p = providerRef.current;
    if (p instanceof WhisperProvider) p.cancelLoad();
    setModelProgress(null);
  }, []);

  const switchToFast = useCallback(async () => {
    await teardownEngine();
    await persistSession({ transcriptionEngine: "web-speech" });
    setNeedsModelDownload(false);
    setModelProgress(null);
    dispatch({ type: "RESET" });
    await begin();
  }, [begin, persistSession, teardownEngine]);

  const retry = useCallback(async () => {
    await teardownEngine();
    setModelProgress(null);
    dispatch({ type: "RESET" });
    await begin();
  }, [begin, teardownEngine]);

  // ---------- 載入 ----------

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [s, segs, ns, gl, rs] = await Promise.all([
          db.getSession(sessionId),
          db.listSegments(sessionId),
          db.listNotes(sessionId),
          db.listGlossary(sessionId),
          db.listRules(),
        ]);
        if (cancelled) return;
        if (!s) {
          setSession(null);
          return;
        }
        if (s.status === "ended") {
          router.replace(`/review?id=${s.id}`);
          return;
        }
        timing.current.accumulated = s.duration;
        setElapsed(s.duration);
        sessionRef.current = s;
        setSession(s);
        segmentsRef.current = segs;
        setSegments(segs);
        setNotes(ns);
        setGlossary(gl);
        setRules(rs);
        const t = createChromeTranslation();
        translationRef.current = t;
        setTranslationSupported(t != null);
      } catch {
        if (!cancelled) {
          setStorageError(ERRORS.storageFailed());
          setSession(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  // 課堂載入後自動開始（使用者在上一頁已經按了「開始轉錄」）
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!session || autoStarted.current) return;
    autoStarted.current = true;
    void begin();
  }, [session, begin]);

  // ---------- 時鐘與音量 ----------

  useEffect(() => {
    const active = isActive(machine.status);
    if (!active) return;
    const id = setInterval(() => setElapsed(activeSecondsAt(Date.now())), 1000);
    return () => clearInterval(id);
  }, [machine.status, activeSecondsAt]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      levelRef.current = meterRef.current?.getLevel() ?? 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 每 20 秒把累計時長寫回 session，重新整理後時間才不會歸零
  useEffect(() => {
    if (!isActive(machine.status)) return;
    const id = setInterval(() => void persistSession({ duration: activeSecondsAt(Date.now()) }), 20000);
    return () => clearInterval(id);
  }, [machine.status, activeSecondsAt, persistSession]);

  // ---------- 環境事件 ----------

  useEffect(() => {
    const onVis = () => setBackgrounded(document.hidden && isActive(machineRef.current.status));
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (isActive(machineRef.current.status)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", onUnload);
    setOffline(navigator.onLine === false);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  // 離開頁面時釋放麥克風與引擎
  useEffect(() => {
    return () => {
      void teardownEngine();
      translationRef.current?.destroy();
    };
  }, [teardownEngine]);

  // ---------- 動作 ----------

  const pause = useCallback(() => {
    if (!isActive(machineRef.current.status)) return;
    providerRef.current?.pause();
    stopClock();
    dispatch({ type: "PAUSE" });
    void persistSession({ duration: timing.current.accumulated });
    const last = segmentsRef.current[segmentsRef.current.length - 1];
    if (last) void translateSegment(last);
  }, [persistSession, stopClock, translateSegment]);

  const resume = useCallback(() => {
    if (machineRef.current.status !== "paused") return;
    providerRef.current?.resume();
    startClock();
    dispatch({ type: "RESUME" });
  }, [startClock]);

  const end = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopClock();
    dispatch({ type: "END" });
    await teardownEngine();
    const last = segmentsRef.current[segmentsRef.current.length - 1];
    if (last) await translateSegment(last);
    await persistSession({ status: "ended", endedAt: nowIso(), duration: timing.current.accumulated });
    const id = sessionRef.current?.id;
    if (id) router.push(`/review?id=${id}`);
  }, [persistSession, router, stopClock, teardownEngine, translateSegment]);

  const saveNow = useCallback(async () => {
    setSaveState("saving");
    try {
      await db.putSegments(segmentsRef.current);
      await persistSession({ duration: activeSecondsAt(Date.now()) });
      setSaveState("saved");
      setStorageError(null);
    } catch {
      setSaveState("failed");
      setStorageError(ERRORS.storageFailed());
    }
  }, [activeSecondsAt, persistSession]);

  const setTitle = useCallback((title: string) => void persistSession({ title: title.trim() || "未命名課堂" }), [persistSession]);

  const setLanguageMode = useCallback(
    (mode: Session["languageMode"]) => {
      void persistSession({ languageMode: mode });
      const p = providerRef.current;
      if (p instanceof WebSpeechProvider || p instanceof GroqProvider) p.setLanguageMode(mode);
    },
    [persistSession],
  );

  const setTranslationEnabled = useCallback(
    async (on: boolean) => {
      await persistSession({ translationEnabled: on });
      if (!on || !translationRef.current) return;
      setTranslationProgress(0);
      try {
        await translationRef.current.prepare((p) => setTranslationProgress(p));
      } catch {
        setTranslationProgress(null);
        return;
      }
      setTranslationProgress(null);
      // 已有的段落逐一補譯（最後一段還在長，先不翻）
      const list = segmentsRef.current.slice(0, isActive(machineRef.current.status) ? -1 : undefined);
      for (const seg of list) await translateSegment(seg);
    },
    [persistSession, translateSegment],
  );

  const updateSegmentText = useCallback(
    async (id: string, text: string) => {
      const seg = segmentsRef.current.find((s) => s.id === id);
      if (!seg) return;
      const updated: TranscriptSegment = { ...seg, text, editedByUser: true, translation: null, detectedLanguage: detectLanguage(text), updatedAt: nowIso() };
      const next = segmentsRef.current.map((s) => (s.id === id ? updated : s));
      segmentsRef.current = next;
      setSegments(next);
      await persistSegment(updated);
      void translateSegment(updated);
    },
    [persistSegment, translateSegment],
  );

  const restoreSegmentRaw = useCallback(
    async (id: string) => {
      const seg = segmentsRef.current.find((s) => s.id === id);
      if (!seg || seg.rawText == null) return;
      await updateSegmentText(id, seg.rawText);
      const cleared = segmentsRef.current.map((s) => (s.id === id ? { ...s, rawText: null } : s));
      segmentsRef.current = cleared;
      setSegments(cleared);
      const c = cleared.find((s) => s.id === id);
      if (c) await persistSegment(c);
    },
    [persistSegment, updateSegmentText],
  );

  const toggleBookmark = useCallback(
    async (id: string) => {
      const next = segmentsRef.current.map((s) => (s.id === id ? { ...s, isBookmarked: !s.isBookmarked } : s));
      segmentsRef.current = next;
      setSegments(next);
      const seg = next.find((s) => s.id === id);
      if (seg) await persistSegment(seg);
    },
    [persistSegment],
  );

  const addNote = useCallback(
    async (text: string, tag: NoteTag, referencedSegmentId: string | null) => {
      const s = sessionRef.current;
      const clean = text.trim();
      if (!s || !clean) return;
      const t = nowIso();
      const note: PersonalNote = { id: newId(), sessionId: s.id, text: clean, tag, timestamp: activeSecondsAt(Date.now()), referencedSegmentId, createdAt: t, updatedAt: t };
      setNotes((prev) => [...prev, note]);
      try {
        await db.putNote(note);
      } catch {
        setStorageError(ERRORS.storageFailed());
      }
    },
    [activeSecondsAt],
  );

  const updateNote = useCallback(async (id: string, patch: Partial<PersonalNote>) => {
    let updated: PersonalNote | undefined;
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        updated = { ...n, ...patch, updatedAt: nowIso() };
        return updated;
      }),
    );
    // setState 的 updater 是同步執行的，這裡拿得到 updated
    if (updated) await db.putNote(updated).catch(() => setStorageError(ERRORS.storageFailed()));
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await db.deleteNote(id).catch(() => setStorageError(ERRORS.storageFailed()));
  }, []);

  const addGlossary = useCallback(async (term: string) => {
    const s = sessionRef.current;
    const added = await db.addGlossaryTerm(term, s?.id ?? null).catch(() => null);
    if (added) setGlossary((prev) => [...prev, added]);
  }, []);

  const removeGlossary = useCallback(async (id: string) => {
    setGlossary((prev) => prev.filter((g) => g.id !== id));
    await db.deleteGlossaryTerm(id).catch(() => {});
  }, []);

  const addRule = useCallback(async (from: string, to: string, enabled = true) => {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t) return;
    const rule: CorrectionRule = { id: newId(), from: f, to: t, enabled, createdAt: nowIso() };
    setRules((prev) => [...prev, rule]);
    await db.putRule(rule).catch(() => {});
  }, []);

  const toggleRule = useCallback(async (id: string, enabled: boolean) => {
    let updated: CorrectionRule | undefined;
    setRules((prev) => prev.map((r) => (r.id === id ? (updated = { ...r, enabled }) : r)));
    if (updated) await db.putRule(updated).catch(() => {});
  }, []);

  const removeRule = useCallback(async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    await db.deleteRule(id).catch(() => {});
  }, []);

  const dismissLag = useCallback(() => setLagNotice(false), []);

  return {
    session, machine, segments, interim, elapsed, saveState, storageError, backgrounded, offline, lagNotice,
    modelProgress, needsModelDownload, caps, levelRef, notes, glossary, rules, translationSupported, translationProgress,
    downloadModel, cancelDownload, switchToFast, retry, pause, resume, end, saveNow, setTitle, setLanguageMode,
    setTranslationEnabled, updateSegmentText, toggleBookmark, restoreSegmentRaw, addNote, updateNote, deleteNote,
    addGlossary, removeGlossary, addRule, toggleRule, removeRule, dismissLag,
  };
}
