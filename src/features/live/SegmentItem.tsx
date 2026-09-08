"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { formatTimestamp } from "@/lib/export";
import { highlightReplacements } from "@/lib/transcript/corrections";
import type { CorrectionRule, TranscriptSegment } from "@/lib/types";

export interface SegmentActions {
  onEdit(id: string, text: string): void;
  onToggleBookmark(id: string): void;
  onRestoreRaw?(id: string): void;
  onQuote?(seg: TranscriptSegment): void;
  onSuggestRule?(before: string, after: string): void;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 搜尋醒目標示：英文不分大小寫 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const re = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => (p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

export function SegmentItem({ seg, query, rules, actions, showTranslation, isCurrentMatch }: {
  seg: TranscriptSegment; query: string; rules: CorrectionRule[]; actions: SegmentActions; showTranslation: boolean; isCurrentMatch?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(seg.text);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.setSelectionRange(draft.length, draft.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== seg.text) {
      actions.onEdit(seg.id, next);
      actions.onSuggestRule?.(seg.text, next);
    } else {
      setDraft(seg.text);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(seg.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪貼簿被擋就算了 */
    }
  }

  // 有 rawText 代表套過校正規則：把被替換的字標出來
  const applied = seg.rawText != null && !seg.editedByUser
    ? rules.filter((r) => r.enabled && seg.text.includes(r.to) && seg.rawText!.includes(r.from)).map((r) => ({ from: r.from, to: r.to }))
    : [];
  const parts = highlightReplacements(seg.text, applied);

  return (
    <article
      id={`seg-${seg.id}`}
      className={`group relative pl-14 sm:pl-16 pr-2 py-2 rounded-control transition-colors duration-150 ${isCurrentMatch ? "bg-brand-soft" : "hover:bg-surface-2/60 focus-within:bg-surface-2/60"}`}
      aria-label={`${formatTimestamp(seg.timestamp)} 段落`}
    >
      <span className="absolute left-0 top-2.5 w-12 sm:w-14 text-right text-[12px] tnum text-secondary/70 select-none">{formatTimestamp(seg.timestamp)}</span>
      {seg.isBookmarked && <span className="absolute left-[3.1rem] sm:left-[3.6rem] top-3 text-brand" aria-label="已標記"><Icon name="bookmark" size={12} /></span>}

      {editing ? (
        <div>
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setDraft(seg.text); setEditing(false); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            }}
            rows={Math.max(2, Math.ceil(draft.length / 40))}
            className="reading w-full rounded-control border border-border bg-surface px-3 py-2"
            aria-label="編輯段落"
          />
          <div className="mt-1.5 flex gap-2 items-center">
            <Button variant="primary" size="sm" icon="check" onClick={commit}>儲存</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(seg.text); setEditing(false); }}>取消</Button>
            <span className="text-xs text-secondary">Cmd/Ctrl + Enter 儲存，Esc 取消</span>
          </div>
        </div>
      ) : (
        <p className="reading">
          {parts.map((p, i) =>
            p.from ? (
              <span key={i} className="corrected" title={`原本辨識為「${p.from}」`}>{p.text}</span>
            ) : (
              <Highlight key={i} text={p.text} query={query} />
            ),
          )}
        </p>
      )}

      {showTranslation && seg.translation && !editing && (
        <p className="mt-1 text-[0.88em] leading-relaxed text-secondary reading" lang={seg.translation.lang === "en" ? "en" : "zh-Hant"} style={{ fontSize: "calc(var(--reading-font-size) * 0.88)" }}>
          {seg.translation.text}
        </p>
      )}

      {!editing && (
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 bg-surface/90 rounded-control">
          <Button variant="ghost" size="sm" icon="edit" iconOnly aria-label="編輯段落" onClick={() => setEditing(true)} />
          <Button variant="ghost" size="sm" icon={copied ? "check" : "copy"} iconOnly aria-label={copied ? "已複製" : "複製段落"} onClick={copy} />
          <Button variant="ghost" size="sm" icon="bookmark" iconOnly aria-label={seg.isBookmarked ? "取消標記" : "標記重要"} aria-pressed={seg.isBookmarked} onClick={() => actions.onToggleBookmark(seg.id)} className={seg.isBookmarked ? "text-brand" : ""} />
          {actions.onQuote && <Button variant="ghost" size="sm" icon="notes" iconOnly aria-label="引用到筆記" onClick={() => actions.onQuote!(seg)} />}
          {seg.rawText != null && !seg.editedByUser && actions.onRestoreRaw && (
            <Button variant="ghost" size="sm" icon="refresh" iconOnly aria-label="還原成原始辨識結果" onClick={() => actions.onRestoreRaw!(seg.id)} />
          )}
        </div>
      )}
    </article>
  );
}
