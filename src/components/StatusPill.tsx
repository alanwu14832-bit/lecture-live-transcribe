import { Icon, type IconName } from "./Icon";
import { STATUS_LABELS, type SessionStatusValue } from "@/lib/session-machine";

/** 狀態同時用文字、圖示、顏色表示，不只靠一個紅點 */
const STYLE: Record<SessionStatusValue, { icon: IconName; cls: string; pulse?: boolean }> = {
  idle: { icon: "clock", cls: "bg-surface-2 text-secondary" },
  "checking-capability": { icon: "clock", cls: "bg-surface-2 text-secondary" },
  "requesting-permission": { icon: "mic", cls: "bg-warning-soft text-warning" },
  "downloading-model": { icon: "download", cls: "bg-brand-soft text-brand" },
  ready: { icon: "check", cls: "bg-surface-2 text-secondary" },
  listening: { icon: "mic", cls: "bg-recording-soft text-recording", pulse: true },
  processing: { icon: "refresh", cls: "bg-brand-soft text-brand", pulse: true },
  paused: { icon: "pause", cls: "bg-warning-soft text-warning" },
  recovering: { icon: "refresh", cls: "bg-warning-soft text-warning", pulse: true },
  error: { icon: "alert", cls: "bg-recording-soft text-recording" },
  ended: { icon: "check", cls: "bg-success-soft text-success" },
};

export function StatusPill({ status, size = "md" }: { status: SessionStatusValue; size?: "sm" | "md" }) {
  const s = STYLE[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]"} ${s.cls}`}
    >
      <span className={s.pulse ? "breathe inline-flex" : "inline-flex"}><Icon name={s.icon} size={size === "sm" ? 13 : 14} /></span>
      {STATUS_LABELS[status]}
    </span>
  );
}
