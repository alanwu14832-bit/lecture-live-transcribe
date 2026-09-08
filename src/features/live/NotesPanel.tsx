"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { formatTimestamp } from "@/lib/export";
import { NOTE_TAG_LABELS, type NoteTag, type PersonalNote, type TranscriptSegment } from "@/lib/types";

const TAGS = Object.keys(NOTE_TAG_LABELS) as Array<Exclude<NoteTag, null>>;

export function NotesPanel({
  notes, segments, quoted, onClearQuote, onAdd, onUpdate, onDelete, onClose, focusSignal, readOnly = false,
}: {
  notes: PersonalNote[]; segments: TranscriptSegment[]; quoted: TranscriptSegment | null; onClearQuote: () => void;
  onAdd: (text: string, tag: NoteTag, refId: string | null) => void; onUpdate: (id: string, patch: Partial<PersonalNote>) => void;
  onDelete: (id: string) => void; onClose: () => void; focusSignal: number; readOnly?: boolean;
}) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState<NoteTag>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSignal > 0) input.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    if (quoted) input.current?.focus();
  }, [quoted]);

  function submit() {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean, tag, quoted?.id ?? null);
    setText("");
    setTag(null);
    onClearQuote();
    requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
  }

  const segById = new Map(segments.map((s) => [s.id, s]));

  return (
    <aside className="flex flex-col h-full bg-surface" aria-label="我的筆記">
      <div className="flex items-center justify-between h-12 px-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold inline-flex items-center gap-1.5"><Icon name="notes" size={15} /> 我的筆記</h2>
        <Button variant="ghost" size="sm" icon="x" iconOnly aria-label="關閉筆記" onClick={onClose} />
      </div>

      <div ref={list} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {notes.length === 0 && (
          <p className="text-xs text-secondary leading-relaxed px-1 pt-2">
            這裡是你自己的想法，和自動逐字稿分開存放。按 <kbd className="px-1 rounded border border-border text-[11px]">N</kbd> 可以直接開始輸入。
          </p>
        )}
        {notes.map((n) => {
          const ref = n.referencedSegmentId ? segById.get(n.referencedSegmentId) : null;
          const editing = editingId === n.id;
          return (
            <div key={n.id} className="group rounded-control border border-border bg-canvas/60 p-2.5">
              <div className="flex items-center gap-2 text-[11px] text-secondary tnum">
                <span>{formatTimestamp(n.timestamp)}</span>
                {n.tag && <span className="px-1.5 py-0.5 rounded bg-surface-2 text-primary/80 font-medium">{NOTE_TAG_LABELS[n.tag]}</span>}
                {!readOnly && (
                  <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                    <Button variant="ghost" size="sm" icon="edit" iconOnly aria-label="編輯筆記" onClick={() => { setEditingId(n.id); setEditDraft(n.text); }} />
                    <Button variant="ghost" size="sm" icon="trash" iconOnly aria-label="刪除筆記" onClick={() => onDelete(n.id)} />
                  </span>
                )}
              </div>
              {ref && (
                <blockquote className="mt-1.5 pl-2 border-l-2 border-border text-xs text-secondary line-clamp-2">
                  {ref.text}
                </blockquote>
              )}
              {editing ? (
                <div className="mt-1.5">
                  <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm" aria-label="編輯筆記內容" />
                  <div className="mt-1 flex gap-1.5">
                    <Button variant="primary" size="sm" onClick={() => { onUpdate(n.id, { text: editDraft.trim() || n.text }); setEditingId(null); }}>儲存</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{n.text}</p>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="shrink-0 border-t border-border p-3 space-y-2 safe-bottom">
          {quoted && (
            <div className="flex items-start gap-2 rounded-control bg-surface-2 px-2 py-1.5 text-xs text-secondary">
              <span className="line-clamp-2 flex-1">引用：{quoted.text}</span>
              <button type="button" className="shrink-0" aria-label="取消引用" onClick={onClearQuote}><Icon name="x" size={14} /></button>
            </div>
          )}
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="記一句話，Enter 送出"
            aria-label="新增筆記"
            className="w-full rounded-control border border-border bg-canvas px-2.5 py-2 text-sm placeholder:text-secondary/70 resize-none"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={`h-7 px-2 rounded-control text-xs border transition-colors duration-150 ${tag === t ? "bg-brand-soft border-brand text-brand" : "border-border text-secondary hover:bg-surface-2"}`}
              >
                {NOTE_TAG_LABELS[t]}
              </button>
            ))}
            <Button variant="primary" size="sm" icon="plus" className="ml-auto" onClick={submit} disabled={!text.trim()}>新增</Button>
          </div>
        </div>
      )}
    </aside>
  );
}
