"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { MicLevel } from "@/components/MicLevel";
import { createLevelMeter, listInputDevices, openMicrophone, stopStream, type LevelMeter } from "@/lib/audio/mic";
import { mapMediaError, type AppError } from "@/lib/errors";

type Status = "idle" | "requesting" | "ok" | "error";

export function MicTest({ onStatus }: { onStatus?: (ok: boolean) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<AppError | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [heard, setHeard] = useState(false);
  const levelRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);

  const cleanup = () => {
    meterRef.current?.stop();
    meterRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
  };

  useEffect(() => cleanup, []);

  useEffect(() => {
    if (status !== "ok") return;
    let raf = 0;
    const tick = () => {
      const l = meterRef.current?.getLevel() ?? 0;
      levelRef.current = l;
      if (l > 0.15) setHeard(true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  async function start(id?: string) {
    cleanup();
    setStatus("requesting");
    setError(null);
    setHeard(false);
    try {
      const stream = await openMicrophone(id || undefined);
      streamRef.current = stream;
      meterRef.current = createLevelMeter(stream);
      setStatus("ok");
      onStatus?.(true);
      // 拿到權限後 enumerateDevices 才會給裝置名稱
      const list = await listInputDevices();
      setDevices(list);
      const current = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (current) setDeviceId(current);
    } catch (err) {
      setStatus("error");
      setError(mapMediaError(err));
      onStatus?.(false);
    }
  }

  return (
    <div className="rounded-container border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="font-medium text-sm">麥克風測試</h3>
          <p className="text-xs text-secondary mt-0.5">確認教室電腦收得到聲音，再開始轉錄。</p>
        </div>
        {status === "idle" || status === "error" || status === "requesting" ? (
          <Button variant="secondary" size="sm" icon="mic" onClick={() => start()} disabled={status === "requesting"}>
            測試麥克風
          </Button>
        ) : (
          <Button variant="ghost" size="sm" icon="x" onClick={() => { cleanup(); setStatus("idle"); onStatus?.(false); }}>
            停止測試
          </Button>
        )}
      </div>

      {status === "requesting" && <p className="text-sm text-secondary">瀏覽器正在詢問麥克風權限，請選擇「允許」。</p>}

      {status === "ok" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <MicLevel levelRef={levelRef} active />
            <span className={`text-sm inline-flex items-center gap-1 ${heard ? "text-success" : "text-secondary"}`}>
              {heard ? <><Icon name="check" size={14} /> 收到聲音了</> : "對著麥克風說話看看"}
            </span>
          </div>
          {devices.length > 1 && (
            <label className="block text-xs text-secondary">
              輸入裝置
              <select
                className="mt-1 block w-full h-9 rounded-control border border-border bg-surface text-sm text-primary px-2"
                value={deviceId}
                onChange={(e) => { setDeviceId(e.target.value); start(e.target.value); }}
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || "麥克風"}</option>
                ))}
              </select>
            </label>
          )}
          {devices.length === 1 && <p className="text-xs text-secondary">目前裝置：{devices[0].label || "預設麥克風"}</p>}
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-control bg-warning-soft p-3 text-sm">
          <p className="font-medium mb-1 inline-flex items-center gap-1"><Icon name="alert" size={15} /> {error.title}</p>
          <p className="text-secondary">{error.detail}</p>
          {error.code === "permission-denied" && (
            <ol className="mt-2 list-decimal pl-5 text-secondary space-y-0.5">
              <li>點網址列左側的鎖頭或設定圖示</li>
              <li>找到「麥克風」，改成「允許」</li>
              <li>重新整理頁面後再測試一次</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
