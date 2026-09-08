"use client";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { MicLevel } from "@/components/MicLevel";
import { formatTimestamp } from "@/lib/export";
import { isActive, type SessionStatusValue } from "@/lib/session-machine";
import { LANGUAGE_MODE_LABELS, type Engine, type LanguageMode } from "@/lib/types";
import type { SaveState } from "./useLiveSession";

export function ControlDock({
  status, elapsed, levelRef, saveState, engine, languageMode, onLanguageMode, onPause, onResume, onEnd, onRetry,
}: {
  status: SessionStatusValue; elapsed: number; levelRef: React.MutableRefObject<number>; saveState: SaveState; engine: Engine;
  languageMode: LanguageMode; onLanguageMode: (m: LanguageMode) => void; onPause: () => void; onResume: () => void; onEnd: () => void; onRetry: () => void;
}) {
  const active = isActive(status);
  const paused = status === "paused";
  const canControl = active || paused;
  const starting = status === "checking-capability" || status === "requesting-permission" || status === "downloading-model" || status === "ready";
  return (
    <div className="shrink-0 sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 z-40 w-full sm:w-auto">
      <div className="flex items-center gap-2 sm:gap-3 bg-surface border-t sm:border border-border sm:rounded-full px-3 sm:px-4 py-2 sm:shadow-overlay safe-bottom">
        {/* 1. 是否正在轉錄 */}
        <div className="flex items-center gap-2 pr-1 sm:pr-2 border-r border-border">
          <MicLevel levelRef={levelRef} active={active} compact />
          <span className="tnum text-sm text-secondary hidden sm:inline" aria-hidden="true">{formatTimestamp(elapsed)}</span>
        </div>

        {/* 2. 暫停／繼續 */}
        {status === "error" ? (
          <Button variant="primary" size="md" icon="refresh" onClick={onRetry}>重新連線</Button>
        ) : paused ? (
          <Button variant="primary" size="md" icon="play" onClick={onResume} aria-keyshortcuts="Space">繼續</Button>
        ) : (
          <Button variant="secondary" size="md" icon="pause" onClick={onPause} disabled={!active} aria-keyshortcuts="Space">
            {starting ? "準備中" : "暫停"}
          </Button>
        )}

        {/* 3. 是否安全保存 4. 是否仍在處理 */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-secondary pl-1">
          <SaveBadge state={saveState} />
          {status === "processing" && <span className="inline-flex items-center gap-1 text-brand"><Icon name="refresh" size={13} className="breathe" /> 本機辨識中</span>}
          {status === "recovering" && <span className="inline-flex items-center gap-1 text-warning"><Icon name="refresh" size={13} className="breathe" /> 重新連線中</span>}
        </div>

        <label className="hidden md:flex items-center gap-1 text-xs text-secondary pl-1">
          <span className="sr-only">語言模式</span>
          <select
            value={languageMode}
            onChange={(e) => onLanguageMode(e.target.value as LanguageMode)}
            className="h-8 rounded-control border border-border bg-surface text-xs px-1.5 text-primary"
            aria-label="語言模式"
            disabled={engine === "whisper"}
            title={engine === "whisper" ? "本機雙語辨識會自動判斷語言" : undefined}
          >
            {(Object.keys(LANGUAGE_MODE_LABELS) as LanguageMode[]).map((m) => (
              <option key={m} value={m}>{LANGUAGE_MODE_LABELS[m]}</option>
            ))}
          </select>
        </label>

        {/* 5. 結束課堂（不刪除內容） */}
        <Button variant="danger" size="md" icon="stop" onClick={onEnd} disabled={!canControl && !starting && status !== "error"} className="ml-auto sm:ml-1">
          結束課堂
        </Button>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "failed") return <span className="inline-flex items-center gap-1 text-recording"><Icon name="alert" size={13} /> 未能保存</span>;
  if (state === "saving") return <span className="inline-flex items-center gap-1"><Icon name="refresh" size={13} /> 保存中</span>;
  return <span className="inline-flex items-center gap-1 text-success"><Icon name="check" size={13} /> 已儲存在此裝置</span>;
}
