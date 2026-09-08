"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/Icon";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { listSegments, listSessions, seedDemoIfEmpty } from "@/lib/db";
import { formatDuration } from "@/lib/export";
import { ENGINE_LABELS, LANGUAGE_MODE_LABELS, type Session } from "@/lib/types";

interface Row extends Session {
  chars: number;
}

export function HomeScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedDemoIfEmpty();
        const sessions = await listSessions();
        const withChars = await Promise.all(
          sessions.map(async (s) => {
            const segs = await listSegments(s.id);
            return { ...s, chars: segs.reduce((n, x) => n + x.text.length, 0) };
          }),
        );
        if (!cancelled) setRows(withChars);
      } catch {
        if (!cancelled) {
          setStorageError(true);
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-12 flex-1">
        <section className="mb-10">
          <p className="text-secondary text-sm mb-2">商學院課堂的即時逐字稿</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-5">專心聽課，讓逐字稿跟上你。</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/new" className="inline-flex items-center gap-2 h-11 px-5 rounded-control bg-brand text-white font-medium text-[15px] hover:opacity-90">
              <Icon name="mic" size={18} /> 開始新課堂
            </Link>
            <span className="text-sm text-secondary">不需要帳號，不需要 API Key。</span>
          </div>
        </section>

        <section aria-labelledby="recent">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="recent" className="text-base font-semibold">最近的課堂</h2>
            <span className="text-xs text-secondary inline-flex items-center gap-1"><Icon name="check" size={13} /> 只儲存在這台裝置</span>
          </div>
          {storageError && (
            <div className="rounded-container border border-border bg-warning-soft text-primary p-4 text-sm mb-4">
              <p className="font-medium mb-1">無法讀取這台裝置的儲存空間</p>
              <p className="text-secondary">瀏覽器可能處於隱私模式或封鎖了 IndexedDB。你仍然可以開始課堂，但重新整理後內容可能不會保留。</p>
            </div>
          )}
          {rows === null ? (
            <ul className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-16 rounded-container bg-surface border border-border animate-pulse" />
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border rounded-container border border-border bg-surface overflow-hidden">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${s.status === "ended" ? "/review" : "/live"}?id=${s.id}`}
                    className="flex items-center gap-4 px-4 sm:px-5 py-3.5 hover:bg-surface-2 transition-colors duration-150"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{s.title}</span>
                        {s.status !== "ended" && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-brand-soft text-brand font-medium">進行中</span>}
                      </div>
                      <div className="text-xs text-secondary mt-0.5 tnum flex flex-wrap gap-x-2">
                        <span>{new Date(s.startedAt ?? s.createdAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span>·</span>
                        <span>{formatDuration(s.duration)}</span>
                        <span>·</span>
                        <span>{LANGUAGE_MODE_LABELS[s.languageMode]}</span>
                        <span>·</span>
                        <span>{ENGINE_LABELS[s.transcriptionEngine]}</span>
                        <span>·</span>
                        <span>{s.chars.toLocaleString("zh-TW")} 字</span>
                      </div>
                    </div>
                    <Icon name="chevronDown" size={16} className="-rotate-90 text-secondary shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-10">
          <PrivacyNotice compact />
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-container border border-dashed border-border bg-surface p-8 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center text-secondary">
        <Icon name="book" size={20} />
      </div>
      <p className="font-medium mb-1">還沒有任何課堂</p>
      <p className="text-sm text-secondary mb-4">開始第一堂課後，逐字稿與筆記會出現在這裡，並且只存在這台裝置。</p>
      <Link href="/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-control bg-brand text-white text-sm font-medium hover:opacity-90">
        <Icon name="mic" size={16} /> 開始新課堂
      </Link>
    </div>
  );
}
