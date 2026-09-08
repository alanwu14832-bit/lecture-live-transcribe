"use client";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import type { ModelProgress } from "@/providers/transcription/types";

function mb(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function ModelDownloadDialog({ open, progress, webgpu, onDownload, onCancel, onUseFast, onRetry }: {
  open: boolean; progress: ModelProgress | null; webgpu: boolean; onDownload: () => void; onCancel: () => void; onUseFast: () => void; onRetry: () => void;
}) {
  const downloading = progress && (progress.status === "downloading" || progress.status === "loading");
  const failed = progress?.status === "error";
  const cancelled = progress?.status === "cancelled";
  return (
    <Dialog open={open} onClose={() => {}} title="下載免費雙語辨識模型">
      <ul className="space-y-1.5 text-secondary mb-4">
        <li>· 只需下載一次，之後留在瀏覽器快取</li>
        <li>· 音訊留在這台裝置，不需要帳號或 API Key</li>
        <li>· 會使用較多裝置運算能力與電力</li>
        {!webgpu && <li className="text-warning">· 這台裝置沒有 WebGPU，辨識會慢很多，延遲可能到十幾秒</li>}
      </ul>

      {downloading && (
        <div className="mb-4" aria-live="polite">
          <div className="flex justify-between text-xs text-secondary mb-1 tnum">
            <span>{progress.status === "loading" && progress.progress >= 1 ? "載入模型中" : "下載中"} {Math.round(progress.progress * 100)}%</span>
            <span>{progress.totalBytes > 0 ? `${mb(progress.loadedBytes)} / ${mb(progress.totalBytes)}` : "計算大小中"}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
          </div>
          {progress.file && <p className="text-[11px] text-secondary mt-1 truncate">{progress.file}</p>}
        </div>
      )}

      {failed && (
        <div className="mb-4 rounded-control bg-recording-soft p-3 text-sm">
          <p className="font-medium">下載失敗</p>
          <p className="text-secondary break-words">{progress.message || "網路中斷或瀏覽器無法載入模型。"}</p>
        </div>
      )}
      {cancelled && <p className="mb-4 text-sm text-secondary">已取消。已下載的部分會保留在快取，下次會接著下載。</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {downloading ? (
          <>
            <Button variant="ghost" onClick={onCancel}>取消</Button>
            <Button variant="secondary" onClick={onUseFast}>先使用快速模式</Button>
          </>
        ) : failed ? (
          <>
            <Button variant="secondary" onClick={onUseFast}>先使用快速模式</Button>
            <Button variant="primary" icon="refresh" onClick={onRetry}>重試</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onUseFast}>先使用快速模式</Button>
            <Button variant="primary" icon="download" onClick={onDownload}>下載並開始</Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
