"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";

export function SearchBar({ query, onQuery, count, index, onNext, onPrev, onClose }: {
  query: string; onQuery: (q: string) => void; count: number; index: number; onNext: () => void; onPrev: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="shrink-0 border-b border-border bg-surface px-3 py-2">
      <div className="mx-auto max-w-reading flex items-center gap-2">
        <input
          ref={ref}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.shiftKey ? onPrev : onNext)();
            if (e.key === "Escape") onClose();
          }}
          placeholder="搜尋逐字稿（英文不分大小寫）"
          aria-label="搜尋逐字稿"
          className="flex-1 h-9 rounded-control border border-border bg-canvas px-2.5 text-sm"
        />
        <span className="text-xs text-secondary tnum w-14 text-right" aria-live="polite">{query ? `${count ? index + 1 : 0}/${count}` : ""}</span>
        <Button variant="ghost" size="sm" icon="chevronDown" iconOnly aria-label="上一個" className="rotate-180" onClick={onPrev} disabled={!count} />
        <Button variant="ghost" size="sm" icon="chevronDown" iconOnly aria-label="下一個" onClick={onNext} disabled={!count} />
        <Button variant="ghost" size="sm" icon="x" iconOnly aria-label="關閉搜尋" onClick={onClose} />
      </div>
    </div>
  );
}
