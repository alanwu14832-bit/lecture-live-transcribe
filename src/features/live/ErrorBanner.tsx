"use client";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import type { AppError, ErrorAction } from "@/lib/errors";

/** 常駐錯誤列：說清楚發生什麼、資料安不安全、接下來能做什麼 */
export function ErrorBanner({ error, onAction, tone = "error" }: { error: AppError; onAction: (a: ErrorAction) => void; tone?: "error" | "warning" }) {
  return (
    <div role="alert" className={`shrink-0 border-b border-border px-4 py-3 ${tone === "error" ? "bg-recording-soft" : "bg-warning-soft"}`}>
      <div className="mx-auto max-w-reading flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex gap-2 min-w-0 flex-1">
          <Icon name="alert" size={18} className={`shrink-0 mt-0.5 ${tone === "error" ? "text-recording" : "text-warning"}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{error.title}</p>
            <p className="text-sm text-secondary leading-relaxed">{error.detail}</p>
            {!error.dataSafe && <p className="text-xs text-recording mt-1">畫面上的內容可能不會保留，請先複製或匯出。</p>}
          </div>
        </div>
        {error.actions.length > 0 && (
          <div className="flex gap-2 shrink-0 sm:pl-2">
            {error.actions.map((a, i) => (
              <Button key={a.action} variant={i === 0 ? "primary" : "secondary"} size="sm" onClick={() => onAction(a.action)}>{a.label}</Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function InlineNotice({ icon = "info", children, action }: { icon?: "info" | "alert" | "wifiOff"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-border bg-warning-soft px-4 py-2">
      <div className="mx-auto max-w-reading flex items-center gap-2 text-sm">
        <Icon name={icon} size={16} className="shrink-0 text-warning" />
        <span className="flex-1 min-w-0">{children}</span>
        {action}
      </div>
    </div>
  );
}
