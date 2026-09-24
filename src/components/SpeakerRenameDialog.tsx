"use client";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { speakerLabel } from "@/lib/types";

export function SpeakerRenameDialog({ index, names, onSave, onClose }: { index: number | null; names?: Record<string, string>; onSave: (index: number, name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (index != null) setName(names?.[String(index)] ?? "");
  }, [index, names]);
  const open = index != null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`為${index != null ? speakerLabel(index, undefined) : "講者"}取名`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => { if (index != null) onSave(index, name); onClose(); }}>儲存</Button>
        </>
      }
    >
      <p className="text-secondary mb-3">模型只知道「誰先開口」，不知道誰是教授。取個名字之後，這位講者的所有段落與匯出檔都會用這個名字。</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && index != null) { onSave(index, name); onClose(); }
        }}
        placeholder="例如：教授、同學 A"
        aria-label="講者名稱"
        className="w-full h-10 rounded-control border border-border bg-surface px-3 text-sm"
      />
    </Dialog>
  );
}
