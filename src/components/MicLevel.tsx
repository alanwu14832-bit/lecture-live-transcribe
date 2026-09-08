"use client";
import { useEffect, useState } from "react";

/**
 * 音量條。用 rAF 自己讀 ref，不讓父元件每秒重繪 60 次。
 */
export function MicLevel({ levelRef, active, compact = false }: { levelRef: React.MutableRefObject<number>; active: boolean; compact?: boolean }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 66) {
        setLevel(levelRef.current);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, levelRef]);
  const bars = compact ? 5 : 12;
  return (
    <div className={`flex items-end gap-[3px] ${compact ? "h-4" : "h-6"}`} role="img" aria-label={active ? `麥克風音量 ${Math.round(level * 100)}%` : "麥克風未啟用"}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const on = level >= threshold * 0.9;
        return (
          <span
            key={i}
            className={`w-[3px] rounded-sm transition-colors duration-100 ${on ? "bg-success" : "bg-border"}`}
            style={{ height: `${30 + (i / bars) * 70}%` }}
          />
        );
      })}
    </div>
  );
}
