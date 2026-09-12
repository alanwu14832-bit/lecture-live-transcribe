"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { usePrefs } from "@/components/PrefsProvider";
import type { ErrorAction } from "@/lib/errors";
import { resolveShortcut } from "@/lib/keyboard";
import { isActive } from "@/lib/session-machine";
import { suggestRuleFromEdit } from "@/lib/transcript/corrections";
import { ENGINE_LABELS, type TranscriptSegment } from "@/lib/types";
import { ControlDock } from "./ControlDock";
import { ErrorBanner, InlineNotice } from "./ErrorBanner";
import { ModelDownloadDialog } from "./ModelDownloadDialog";
import { MorePanel } from "./MorePanel";
import { NotesPanel } from "./NotesPanel";
import { SearchBar } from "./SearchBar";
import { StatusBar } from "./StatusBar";
import { TranscriptView } from "./TranscriptView";
import { useLiveSession } from "./useLiveSession";

export function LiveScreen() {
  const params = useSearchParams();
  const id = params.get("id");
  const live = useLiveSession(id);
  const { prefs, update } = usePrefs();
  const [notesOpen, setNotesOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [quoted, setQuoted] = useState<TranscriptSegment | null>(null);
  const [noteFocus, setNoteFocus] = useState(0);
  const [ruleSuggestion, setRuleSuggestion] = useState<{ from: string; to: string } | null>(null);
  const [fastNotice, setFastNotice] = useState(false);

  useEffect(() => {
    // 手機螢幕太小，筆記預設收合；桌面照課堂設定
    if (live.session) setNotesOpen(live.session.notesOpen && window.matchMedia("(min-width: 768px)").matches);
  }, [live.session?.id, live.session?.notesOpen, live.session]);

  // 快速模式第一次啟動時說清楚音訊會去哪裡
  useEffect(() => {
    if (live.session?.transcriptionEngine === "web-speech" && !prefs.fastModeNoticeSeen && isActive(live.machine.status)) setFastNotice(true);
  }, [live.session?.transcriptionEngine, prefs.fastModeNoticeSeen, live.machine.status]);

  const matches = useMemo(() => {
    if (!query.trim()) return [] as string[];
    const q = query.toLowerCase();
    return live.segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.id);
  }, [query, live.segments]);
  useEffect(() => setMatchIndex(0), [query]);
  const currentMatchId = matches.length ? matches[Math.min(matchIndex, matches.length - 1)] : null;

  const togglePause = useCallback(() => {
    if (live.machine.status === "paused") live.resume();
    else live.pause();
  }, [live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = resolveShortcut(e);
      if (!s) return;
      if (s === "escape") {
        if (moreOpen) setMoreOpen(false);
        else if (searchOpen) { setSearchOpen(false); setQuery(""); }
        return;
      }
      e.preventDefault();
      if (s === "toggle-pause") togglePause();
      if (s === "new-note") { setNotesOpen(true); setNoteFocus((n) => n + 1); }
      if (s === "search") setSearchOpen(true);
      if (s === "save") void live.saveNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, live, moreOpen, searchOpen]);

  const onErrorAction = (a: ErrorAction) => {
    if (a === "retry") void live.retry();
    else if (a === "switch-to-fast") void live.switchToFast();
    else if (a === "reload") window.location.reload();
    else if (a === "open-permission-help") window.open("https://support.google.com/chrome/answer/2693767", "_blank", "noopener");
    else if (a === "open-settings") setMoreOpen(true);
  };

  if (live.session === undefined) return <div className="h-screen flex items-center justify-center text-sm text-secondary">載入課堂⋯</div>;
  if (live.session === null) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="font-medium">找不到這堂課</p>
        <p className="text-sm text-secondary">它可能已被刪除，或存在另一個瀏覽器裡。</p>
        <Link href="/" className="text-sm text-brand">回到首頁</Link>
      </div>
    );
  }

  const session = live.session;
  const status = live.machine.status;
  const engineNote = session.transcriptionEngine === "web-speech"
    ? "目前使用快速模式：音訊會送到瀏覽器供應商的伺服器辨識（Chrome 是 Google），逐字稿只存在這台裝置。"
    : session.transcriptionEngine === "groq"
      ? "目前使用自備金鑰引擎：每一句話會以音訊檔送到 Groq 的伺服器辨識，金鑰與逐字稿只存在這台裝置。"
      : "目前使用本機雙語辨識：音訊不會離開這台裝置。";

  return (
    <div className="relative h-[100dvh] flex flex-col overflow-hidden">
      <StatusBar
        title={session.title}
        onTitle={live.setTitle}
        status={status}
        elapsed={live.elapsed}
        notesOpen={notesOpen}
        onToggleNotes={() => setNotesOpen((v) => !v)}
        onSearch={() => setSearchOpen((v) => !v)}
        searchOpen={searchOpen}
        onMore={() => setMoreOpen(true)}
      />

      {live.machine.error && live.machine.error.persistent && <ErrorBanner error={live.machine.error} onAction={onErrorAction} />}
      {live.storageError && <ErrorBanner error={live.storageError} onAction={onErrorAction} tone="warning" />}
      {status === "recovering" && !live.machine.error && (
        <InlineNotice icon="alert">轉錄暫時中斷。已完成的文字仍安全保存在這台裝置。正在嘗試重新連線⋯</InlineNotice>
      )}
      {live.backgrounded && (
        <InlineNotice icon="alert">這個分頁在背景時，瀏覽器可能會暫停麥克風。上課中請讓 CaseNote 留在前景。</InlineNotice>
      )}
      {live.offline && session.transcriptionEngine !== "whisper" && (
        <InlineNotice icon="wifiOff">網路中斷。這個引擎需要網路，已完成的文字不受影響，恢復連線後會自動重連。</InlineNotice>
      )}
      {live.lagNotice && (
        <InlineNotice icon="alert" action={<Button size="sm" variant="ghost" onClick={live.dismissLag}>知道了</Button>}>
          裝置跟不上本機辨識的速度，已略過一段音訊。可以考慮改用快速模式。
        </InlineNotice>
      )}
      {fastNotice && (
        <InlineNotice icon="info" action={<Button size="sm" variant="ghost" onClick={() => { setFastNotice(false); update({ fastModeNoticeSeen: true }); }}>知道了</Button>}>
          快速模式的音訊會送到瀏覽器供應商的伺服器辨識。逐字稿仍只存在這台裝置。
        </InlineNotice>
      )}
      {ruleSuggestion && (
        <InlineNotice
          icon="info"
          action={
            <span className="flex gap-1">
              <Button size="sm" variant="primary" onClick={() => { void live.addRule(ruleSuggestion.from, ruleSuggestion.to); setRuleSuggestion(null); }}>建立規則</Button>
              <Button size="sm" variant="ghost" onClick={() => setRuleSuggestion(null)}>略過</Button>
            </span>
          }
        >
          把「{ruleSuggestion.from}」改成「{ruleSuggestion.to}」——要不要之後自動套用？
        </InlineNotice>
      )}

      {searchOpen && (
        <SearchBar
          query={query}
          onQuery={setQuery}
          count={matches.length}
          index={matchIndex}
          onNext={() => setMatchIndex((i) => (matches.length ? (i + 1) % matches.length : 0))}
          onPrev={() => setMatchIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0))}
          onClose={() => { setSearchOpen(false); setQuery(""); }}
        />
      )}

      <div className="flex-1 flex min-h-0">
        <TranscriptView
          segments={live.segments}
          interim={live.interim}
          query={query}
          currentMatchId={currentMatchId}
          rules={live.rules}
          showTranslation={session.translationEnabled}
          live
          actions={{
            onEdit: (sid, text) => void live.updateSegmentText(sid, text),
            onToggleBookmark: (sid) => void live.toggleBookmark(sid),
            onRestoreRaw: (sid) => void live.restoreSegmentRaw(sid),
            onQuote: (seg) => { setQuoted(seg); setNotesOpen(true); },
            onSuggestRule: (before, after) => {
              const s = suggestRuleFromEdit(before, after);
              if (s && !live.rules.some((r) => r.from === s.from)) setRuleSuggestion(s);
            },
          }}
          emptyHint={
            status === "listening" ? (
              <span className="inline-flex items-center gap-2"><Icon name="mic" size={16} className="text-recording breathe" /> 正在聆聽，講話後文字會出現在這裡。</span>
            ) : status === "requesting-permission" ? "請在瀏覽器的提示中允許使用麥克風。" : status === "error" ? "" : "準備中⋯"
          }
        />

        {notesOpen && (
          <div className="fixed inset-x-0 bottom-[60px] h-[58dvh] z-30 border-t border-border shadow-overlay md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none">
            <NotesPanel
              notes={live.notes}
              segments={live.segments}
              quoted={quoted}
              onClearQuote={() => setQuoted(null)}
              onAdd={(t, tag, ref) => void live.addNote(t, tag, ref)}
              onUpdate={(nid, patch) => void live.updateNote(nid, patch)}
              onDelete={(nid) => void live.deleteNote(nid)}
              onClose={() => setNotesOpen(false)}
              focusSignal={noteFocus}
            />
          </div>
        )}

      </div>

      <ControlDock
        status={status}
        elapsed={live.elapsed}
        levelRef={live.levelRef}
        saveState={live.saveState}
        engine={session.transcriptionEngine}
        languageMode={session.languageMode}
        onLanguageMode={live.setLanguageMode}
        onPause={live.pause}
        onResume={live.resume}
        onEnd={() => void live.end()}
        onRetry={() => void live.retry()}
      />

      <ModelDownloadDialog
        open={status === "downloading-model" && live.needsModelDownload}
        progress={live.modelProgress}
        webgpu={live.caps?.webgpu ?? false}
        onDownload={live.downloadModel}
        onCancel={live.cancelDownload}
        onUseFast={() => void live.switchToFast()}
        onRetry={() => void live.retry()}
      />

      <MorePanel
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        glossary={live.glossary}
        onAddGlossary={(t) => void live.addGlossary(t)}
        onRemoveGlossary={(gid) => void live.removeGlossary(gid)}
        rules={live.rules}
        onAddRule={(f, t, en) => void live.addRule(f, t, en)}
        onToggleRule={(rid, on) => void live.toggleRule(rid, on)}
        onRemoveRule={(rid) => void live.removeRule(rid)}
        translationSupported={live.translationSupported}
        translationEnabled={session.translationEnabled}
        onTranslation={(on) => void live.setTranslationEnabled(on)}
        translationProgress={live.translationProgress}
        engineNote={`${engineNote}（${ENGINE_LABELS[session.transcriptionEngine]}）`}
      />
    </div>
  );
}
