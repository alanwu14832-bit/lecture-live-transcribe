"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * 按住確認：適合「按一下就結束一堂課」這種不該誤觸的動作。
 * 滑鼠或手指按住 durationMs 才觸發，填色用 linear 當進度條；放開就快速退回。
 * 鍵盤使用者按 Enter 或空白鍵走 onKeyboardActivate（開一個確認對話框），不用硬撐著按。
 */
export function HoldButton({ label, icon, durationMs = 1600, onConfirm, onKeyboardActivate, disabled, className = "" }: {
  label: string; icon?: IconName; durationMs?: number; onConfirm: () => void; onKeyboardActivate: () => void; disabled?: boolean; className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => cancel, []);

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, durationMs);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}（按住 ${(durationMs / 1000).toFixed(1).replace(/\.0$/, "")} 秒）`}
      title="按住以確認"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onKeyboardActivate();
        }
      }}
      className={`press relative overflow-hidden inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded-control text-sm font-medium border border-border bg-surface text-recording select-none disabled:opacity-50 ${holding ? "hold-active" : ""} ${className}`}
      style={{ "--hold-duration": `${durationMs}ms` } as React.CSSProperties}
    >
      <span aria-hidden="true" className="hold-fill absolute inset-0 bg-recording" />
      <span className={`relative inline-flex items-center gap-2 transition-colors duration-150 ${holding ? "text-white" : ""}`}>
        {icon && <Icon name={icon} size={17} />}
        {label}
      </span>
    </button>
  );
}
