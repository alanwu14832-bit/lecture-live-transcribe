"use client";
import { speakerLabel } from "@/lib/types";

/** 講者標籤：中性底色加一個依索引固定色相的小圓點，八位講者各一色 */
export function SpeakerChip({ index, names, onClick, size = "md" }: { index: number; names?: Record<string, string>; onClick?: () => void; size?: "sm" | "md" }) {
  const label = speakerLabel(index, names) ?? "";
  const hue = (index * 47 + 210) % 360;
  const cls = `inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 text-secondary font-medium align-middle ${size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs"} ${onClick ? "hover:bg-surface cursor-pointer" : ""}`;
  const dot = <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: `hsl(${hue} 55% 55%)` }} />;
  if (!onClick) return <span className={cls}>{dot}{label}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={`${label}，點擊改名`}>
      {dot}
      {label}
    </button>
  );
}
