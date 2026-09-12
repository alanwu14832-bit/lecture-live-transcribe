"use client";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { loadGroqKey, saveGroqKey } from "@/lib/prefs";
import { testGroqKey } from "@/providers/transcription/groq";

/** Groq 金鑰輸入：儲存到 localStorage，並可用 /models 端點驗證 */
export function GroqKeyField({ onChange }: { onChange?: (hasKey: boolean) => void }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "invalid" | "network">("idle");

  useEffect(() => {
    const k = loadGroqKey();
    setKey(k);
    onChange?.(!!k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(v: string) {
    setKey(v);
    saveGroqKey(v);
    setStatus("idle");
    onChange?.(!!v.trim());
  }

  async function test() {
    setStatus("testing");
    setStatus(await testGroqKey(key));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={(e) => save(e.target.value)}
          placeholder="gsk_…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Groq API key"
          className="flex-1 min-w-0 h-9 rounded-control border border-border bg-surface px-2.5 text-sm font-mono"
        />
        <Button type="button" variant="ghost" size="md" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? "隱藏" : "顯示"}</Button>
        <Button type="button" variant="secondary" size="md" onClick={test} disabled={!key.trim() || status === "testing"}>
          {status === "testing" ? "測試中" : "測試金鑰"}
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={status === "ok" ? "text-success" : status === "invalid" || status === "network" ? "text-recording" : "text-secondary"}>
          {status === "ok" && <><Icon name="check" size={12} className="inline mr-1" />金鑰有效</>}
          {status === "invalid" && "Groq 拒絕了這組金鑰，請確認有沒有貼錯"}
          {status === "network" && "連不上 Groq，請檢查網路"}
          {status === "idle" && (key ? "已儲存在這台裝置" : "還沒設定")}
        </span>
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">到 console.groq.com 免費申請</a>
      </div>
    </div>
  );
}
