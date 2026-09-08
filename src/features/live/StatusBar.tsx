"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { formatTimestamp } from "@/lib/export";
import type { SessionStatusValue } from "@/lib/session-machine";

export function StatusBar({
  title, onTitle, status, elapsed, notesOpen, onToggleNotes, onSearch, onMore, searchOpen,
}: {
  title: string; onTitle: (t: string) => void; status: SessionStatusValue; elapsed: number;
  notesOpen: boolean; onToggleNotes: () => void; onSearch: () => void; onMore: () => void; searchOpen: boolean;
}) {
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);
  return (
    <header className="shrink-0 z-20 bg-canvas border-b border-border">
      <div className="h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
        <Link href="/" className="inline-flex items-center h-9 px-2 -ml-1 rounded-control text-sm text-secondary hover:text-primary hover:bg-surface-2 shrink-0" aria-label="返回首頁">
          <span aria-hidden="true">←</span>
        </Link>
        <input
          aria-label="課程名稱"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== title && onTitle(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 sm:flex-none sm:w-64 h-9 px-2 rounded-control bg-transparent hover:bg-surface-2 focus:bg-surface border border-transparent focus:border-border text-sm font-medium truncate"
        />
        <div className="hidden sm:flex items-center gap-3 mx-auto">
          <StatusPill status={status} />
          <span className="tnum text-sm text-secondary" aria-label="經過時間">{formatTimestamp(elapsed)}</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1 shrink-0">
          <Button variant={searchOpen ? "secondary" : "ghost"} size="sm" icon="search" iconOnly aria-label="搜尋逐字稿" aria-pressed={searchOpen} onClick={onSearch} />
          <Button variant={notesOpen ? "secondary" : "ghost"} size="sm" icon="notes" iconOnly aria-label="個人筆記" aria-pressed={notesOpen} onClick={onToggleNotes} />
          <Button variant="ghost" size="sm" icon="more" iconOnly aria-label="更多：詞彙表、校正規則與顯示設定" onClick={onMore} />
        </div>
      </div>
      <div className="sm:hidden flex items-center justify-between px-3 pb-2">
        <StatusPill status={status} size="sm" />
        <span className="tnum text-xs text-secondary">{formatTimestamp(elapsed)}</span>
      </div>
    </header>
  );
}
