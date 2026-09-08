"use client";
import Link from "next/link";
import { Button } from "./Button";
import { usePrefs } from "./PrefsProvider";

export function AppHeader({ backHref, title, right }: { backHref?: string; title?: string; right?: React.ReactNode }) {
  const { prefs, update } = usePrefs();
  const dark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  return (
    <header className="sticky top-0 z-20 bg-canvas/95 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center gap-3">
        {backHref ? (
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-secondary hover:text-primary rounded-control px-1 -ml-1">
            <span aria-hidden="true">←</span> 返回
          </Link>
        ) : (
          <Link href="/" className="font-semibold tracking-tight text-[15px]">CaseNote</Link>
        )}
        {title && <span className="text-sm text-secondary truncate">{title}</span>}
        <div className="ml-auto flex items-center gap-1">
          {right}
          <Button
            variant="ghost"
            size="sm"
            icon={dark ? "sun" : "moon"}
            iconOnly
            aria-label={dark ? "切換為淺色" : "切換為深色"}
            onClick={() => update({ theme: dark ? "light" : "dark" })}
          />
          <span className="sr-only">目前主題：{prefs.theme}</span>
        </div>
      </div>
    </header>
  );
}
