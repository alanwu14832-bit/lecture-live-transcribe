"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { usePrefs } from "@/components/PrefsProvider";
import * as db from "@/lib/db";
import { downloadText, formatDuration, safeFilename, SUMMARY_PROMPT, toMarkdown, toTxt } from "@/lib/export";
import { resolveShortcut } from "@/lib/keyboard";
import { detectLanguage } from "@/lib/transcript/segmentation";
import { ENGINE_LABELS, LANGUAGE_MODE_LABELS, type CorrectionRule, type NoteTag, type PersonalNote, type Session, type TranscriptSegment } from "@/lib/types";
import { newId, nowIso } from "@/lib/types";
import { createChromeTranslation, type TranslationProvider } from "@/providers/translation/chrome";
import { NotesPanel } from "../live/NotesPanel";
import { SearchBar } from "../live/SearchBar";
import { TranscriptView } from "../live/TranscriptView";
import { Toggle } from "../live/MorePanel";

export function ReviewScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const { prefs, update } = usePrefs();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [rules, setRules] = useState<CorrectionRule[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<TranscriptSegment | null>(null);
  const [translation, setTranslation] = useState<TranslationProvider | null>(null);
  const [translating, setTranslating] = useState(false);
  const [opts, setOpts] = useState({ includeTranslation: false, includeNotes: true, includeSummaryPrompt: false });

  useEffect(() => {
    if (!id) {
      setSession(null);
      return;
    }
    (async () => {
      const [s, segs, ns, rs] = await Promise.all([db.getSession(id), db.listSegments(id), db.listNotes(id), db.listRules()]);
      setSession(s ?? null);
      setSegments(segs);
      setNotes(ns);
      setRules(rs);
      setNotesOpen((s?.notesOpen ?? true) && window.matchMedia("(min-width: 768px)").matches);
      setTranslation(createChromeTranslation());
    })();
  }, [id]);

  const matches = useMemo(() => {
    if (!query.trim()) return [] as string[];
    const q = query.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.id);
  }, [query, segments]);
  useEffect(() => setMatchIndex(0), [query]);
  const currentMatchId = matches.length ? matches[Math.min(matchIndex, matches.length - 1)] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = resolveShortcut(e);
      if (s === "search") { e.preventDefault(); setSearchOpen(true); }
      if (s === "escape") { setSearchOpen(false); setQuery(""); }
      if (s === "new-note") { e.preventDefault(); setNotesOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const persist = useCallback(async (seg: TranscriptSegment) => {
    setSegments((prev) => prev.map((s) => (s.id === seg.id ? seg : s)));
    await db.putSegment(seg);
  }, []);

  const translateAll = useCallback(async (on: boolean) => {
    if (!session) return;
    const next = await db.updateSession(session.id, { translationEnabled: on });
    if (next) setSession(next);
    if (!on || !translation) return;
    setTranslating(true);
    try {
      await translation.prepare();
      for (const seg of segments) {
        if (seg.translation) continue;
        const r = await translation.translate(seg.text, seg.detectedLanguage);
        if (r) await persist({ ...seg, translation: r });
      }
    } finally {
      setTranslating(false);
    }
  }, [persist, segments, session, translation]);

  if (session === undefined) return <div className="h-screen flex items-center justify-center text-sm text-secondary">載入課堂⋯</div>;
  if (session === null) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="font-medium">找不到這堂課</p>
        <Link href="/" className="text-sm text-brand">回到首頁</Link>
      </div>
    );
  }

  const chars = segments.reduce((n, s) => n + s.text.length, 0);
  const filename = safeFilename(session.title);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(toTxt(session!, segments, notes, opts));
      setCopied("all");
      setTimeout(() => setCopied(null), 1500);
    } catch { /* 剪貼簿被擋 */ }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(`${toTxt(session!, segments, notes, { includeNotes: true })}\n----\n${SUMMARY_PROMPT}`);
      setCopied("prompt");
      setTimeout(() => setCopied(null), 1500);
    } catch { /* 剪貼簿被擋 */ }
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <AppHeader
        backHref="/"
        title={session.title}
        right={
          <>
            <Button variant="ghost" size="sm" icon="search" iconOnly aria-label="搜尋逐字稿" onClick={() => setSearchOpen((v) => !v)} aria-pressed={searchOpen} />
            <Button variant="ghost" size="sm" icon="notes" iconOnly aria-label="我的筆記" onClick={() => setNotesOpen((v) => !v)} aria-pressed={notesOpen} />
            <Button variant="secondary" size="sm" icon="download" onClick={() => setExportOpen(true)}>匯出</Button>
          </>
        }
      />

      <div className="shrink-0 border-b border-border bg-surface px-4 sm:px-6 py-2.5">
        <div className="mx-auto max-w-reading flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary tnum">
          <span>{new Date(session.startedAt ?? session.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span>{formatDuration(session.duration)}</span>
          <span>{LANGUAGE_MODE_LABELS[session.languageMode]}</span>
          <span>{ENGINE_LABELS[session.transcriptionEngine]}</span>
          <span>{segments.length} 段 · {chars.toLocaleString("zh-TW")} 字</span>
          <span className="inline-flex items-center gap-1 text-success"><Icon name="check" size={12} /> 已儲存在此裝置</span>
          {translation && (
            <label className="ml-auto inline-flex items-center gap-2">
              <span>對照翻譯</span>
              <Toggle on={session.translationEnabled} onChange={(v) => void translateAll(v)} label="對照翻譯" busy={translating} small />
            </label>
          )}
        </div>
      </div>

      {searchOpen && (
        <SearchBar
          query={query} onQuery={setQuery} count={matches.length} index={matchIndex}
          onNext={() => setMatchIndex((i) => (matches.length ? (i + 1) % matches.length : 0))}
          onPrev={() => setMatchIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0))}
          onClose={() => { setSearchOpen(false); setQuery(""); }}
        />
      )}

      <div className="flex-1 flex min-h-0">
        <TranscriptView
          segments={segments}
          interim=""
          query={query}
          currentMatchId={currentMatchId}
          rules={rules}
          showTranslation={session.translationEnabled}
          live={false}
          actions={{
            onEdit: (sid, text) => {
              const seg = segments.find((s) => s.id === sid);
              if (seg) void persist({ ...seg, text, editedByUser: true, translation: null, detectedLanguage: detectLanguage(text), updatedAt: nowIso() });
            },
            onToggleBookmark: (sid) => {
              const seg = segments.find((s) => s.id === sid);
              if (seg) void persist({ ...seg, isBookmarked: !seg.isBookmarked });
            },
            onRestoreRaw: (sid) => {
              const seg = segments.find((s) => s.id === sid);
              if (seg && seg.rawText != null) void persist({ ...seg, text: seg.rawText, rawText: null, translation: null, editedByUser: true });
            },
            onQuote: (seg) => { setQuoted(seg); setNotesOpen(true); },
          }}
          emptyHint="這堂課沒有逐字稿。"
        />
        {notesOpen && (
          <div className="fixed inset-x-0 bottom-0 h-[62dvh] z-30 border-t border-border shadow-overlay md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none">
            <NotesPanel
              notes={notes}
              segments={segments}
              quoted={quoted}
              onClearQuote={() => setQuoted(null)}
              onAdd={(text: string, tag: NoteTag, refId: string | null) => {
                const t = nowIso();
                const n: PersonalNote = { id: newId(), sessionId: session.id, text, tag, timestamp: session.duration, referencedSegmentId: refId, createdAt: t, updatedAt: t };
                setNotes((prev) => [...prev, n]);
                void db.putNote(n);
              }}
              onUpdate={(nid, patch) => {
                setNotes((prev) => prev.map((n) => {
                  if (n.id !== nid) return n;
                  const u = { ...n, ...patch };
                  void db.putNote(u);
                  return u;
                }));
              }}
              onDelete={(nid) => { setNotes((prev) => prev.filter((n) => n.id !== nid)); void db.deleteNote(nid); }}
              onClose={() => setNotesOpen(false)}
              focusSignal={0}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-2 flex items-center gap-2 safe-bottom">
        <div className="mx-auto max-w-reading w-full flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={copied === "all" ? "check" : "copy"} onClick={copyAll}>{copied === "all" ? "已複製" : "複製全文"}</Button>
          <Button size="sm" variant="secondary" icon="download" onClick={() => setExportOpen(true)}>匯出</Button>
          <div className="ml-auto flex items-center gap-1 text-xs text-secondary">
            <span className="hidden sm:inline">字級</span>
            {([1, 2, 3] as const).map((s) => (
              <button key={s} type="button" aria-pressed={prefs.fontSize === s} onClick={() => update({ fontSize: s })} className={`h-7 w-7 rounded-control text-xs ${prefs.fontSize === s ? "bg-brand-soft text-brand font-medium" : "hover:bg-surface-2"}`}>
                {s === 1 ? "小" : s === 2 ? "中" : "大"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" icon="trash" iconOnly aria-label="刪除這堂課" onClick={() => setDeleteOpen(true)} />
        </div>
      </div>

      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} title="匯出逐字稿">
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3"><span>附上我的筆記</span><Toggle on={opts.includeNotes} onChange={(v) => setOpts({ ...opts, includeNotes: v })} label="附上筆記" small /></label>
          <label className="flex items-center justify-between gap-3">
            <span>附上譯文 <span className="text-secondary text-xs">{segments.some((s) => s.translation) ? "" : "（目前沒有譯文）"}</span></span>
            <Toggle on={opts.includeTranslation} onChange={(v) => setOpts({ ...opts, includeTranslation: v })} label="附上譯文" small />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>附上摘要提示詞 <span className="text-secondary text-xs block">貼到任何 AI 網頁就能請它整理重點。CaseNote 本身不做摘要。</span></span>
            <Toggle on={opts.includeSummaryPrompt} onChange={(v) => setOpts({ ...opts, includeSummaryPrompt: v })} label="附上摘要提示詞" small />
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="primary" icon="download" onClick={() => downloadText(`${filename}.md`, toMarkdown(session, segments, notes, opts), "text/markdown")}>下載 Markdown</Button>
            <Button variant="secondary" icon="download" onClick={() => downloadText(`${filename}.txt`, toTxt(session, segments, notes, opts))}>下載 TXT</Button>
            <Button variant="secondary" icon={copied === "prompt" ? "check" : "copy"} onClick={copyPrompt}>{copied === "prompt" ? "已複製" : "複製逐字稿＋摘要提示詞"}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="刪除這堂課？"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button variant="recording" icon="trash" onClick={async () => { await db.deleteSession(session.id); router.push("/"); }}>刪除</Button>
          </>
        }
      >
        <p className="text-secondary">會刪除「{session.title}」的逐字稿、筆記與本堂詞彙。這個動作無法復原，刪除前可以先匯出。</p>
      </Dialog>
    </div>
  );
}
