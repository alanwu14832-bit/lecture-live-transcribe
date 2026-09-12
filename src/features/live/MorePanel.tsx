"use client";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { usePrefs } from "@/components/PrefsProvider";
import { SUGGESTED_RULES } from "@/lib/transcript/corrections";
import { GroqKeyField } from "@/components/GroqKeyField";
import type { CorrectionRule, GlossaryTerm } from "@/lib/types";

type Tab = "display" | "glossary" | "rules";

export function MorePanel({
  open, onClose, glossary, onAddGlossary, onRemoveGlossary, rules, onAddRule, onToggleRule, onRemoveRule,
  translationSupported, translationEnabled, onTranslation, translationProgress, engineNote,
}: {
  open: boolean; onClose: () => void; glossary: GlossaryTerm[]; onAddGlossary: (t: string) => void; onRemoveGlossary: (id: string) => void;
  rules: CorrectionRule[]; onAddRule: (from: string, to: string, enabled?: boolean) => void; onToggleRule: (id: string, on: boolean) => void; onRemoveRule: (id: string) => void;
  translationSupported: boolean; translationEnabled: boolean; onTranslation: (on: boolean) => void; translationProgress: number | null; engineNote: string;
}) {
  const [tab, setTab] = useState<Tab>("display");
  const { prefs, update } = usePrefs();
  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const tabs: Array<[Tab, string]> = [["display", "顯示"], ["glossary", "詞彙表"], ["rules", "校正規則"]];

  return (
    <Dialog open={open} onClose={onClose} title="設定" wide>
      <div role="tablist" className="flex gap-1 border-b border-border mb-4">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-9 px-3 text-sm -mb-px border-b-2 transition-colors duration-150 ${tab === t ? "border-brand text-primary font-medium" : "border-transparent text-secondary hover:text-primary"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "display" && (
        <div className="space-y-5">
          <Row title="字級" desc="只影響逐字稿閱讀區。">
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((s) => (
                <Button key={s} size="sm" variant={prefs.fontSize === s ? "primary" : "secondary"} onClick={() => update({ fontSize: s })} aria-pressed={prefs.fontSize === s}>
                  {s === 1 ? "小" : s === 2 ? "中" : "大"}
                </Button>
              ))}
            </div>
          </Row>
          <Row title="主題" desc="跟隨系統、淺色或深色。">
            <div className="flex gap-1">
              {(["system", "light", "dark"] as const).map((t) => (
                <Button key={t} size="sm" variant={prefs.theme === t ? "primary" : "secondary"} onClick={() => update({ theme: t })} aria-pressed={prefs.theme === t}>
                  {t === "system" ? "系統" : t === "light" ? "淺色" : "深色"}
                </Button>
              ))}
            </div>
          </Row>
          <Row
            title="對照翻譯"
            desc={translationSupported
              ? "在每段下方顯示 Chrome 內建翻譯的譯文（中翻英、英翻中）。模型在本機執行；原始逐字稿不會被改動。"
              : "這個瀏覽器沒有內建翻譯功能（需要 Chrome 138 以上）。逐字稿其他功能不受影響。"}
          >
            {translationSupported ? (
              <Toggle on={translationEnabled} onChange={onTranslation} label="對照翻譯" busy={translationProgress != null} />
            ) : (
              <span className="text-xs text-secondary">不支援</span>
            )}
          </Row>
          {translationProgress != null && (
            <div className="text-xs text-secondary tnum">準備翻譯模型 {Math.round(translationProgress * 100)}%</div>
          )}
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium mb-1">Groq 金鑰（自備金鑰引擎）</p>
            <p className="text-xs text-secondary mb-2 leading-relaxed">免費申請，只存在這台裝置。改了金鑰要重新開始課堂才會生效。</p>
            <GroqKeyField />
          </div>
          <p className="text-xs text-secondary border-t border-border pt-3">{engineNote}</p>
        </div>
      )}

      {tab === "glossary" && (
        <div className="space-y-3">
          <p className="text-xs text-secondary">支援 phrase biasing 的引擎會把這些詞當作辨識提示；不支援時完全不影響轉錄。詞彙只存在這台裝置。</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onAddGlossary(term);
              setTerm("");
            }}
          >
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="新增詞彙，例如 terminal value" aria-label="新增詞彙" className="flex-1 h-9 rounded-control border border-border bg-surface px-2.5 text-sm" />
            <Button type="submit" variant="primary" size="md" icon="plus" disabled={!term.trim()}>新增</Button>
          </form>
          <ul className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
            {glossary.map((g) => (
              <li key={g.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-border bg-surface text-xs">
                <span>{g.term}</span>
                {g.sessionId && <span className="text-[10px] text-secondary">本堂</span>}
                <button type="button" aria-label={`刪除 ${g.term}`} onClick={() => onRemoveGlossary(g.id)} className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-surface-2 text-secondary"><Icon name="x" size={12} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "rules" && (
        <div className="space-y-4">
          <Row title="啟用校正規則" desc="只套用在定稿文字。被替換的字會有點狀底線，滑鼠移上去看得到原本辨識的字，也可以還原。沒有規則時不會改動任何逐字稿。">
            <Toggle on={prefs.correctionsEnabled} onChange={(v) => update({ correctionsEnabled: v })} label="校正規則" />
          </Row>
          <form
            className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onAddRule(from, to);
              setFrom("");
              setTo("");
            }}
          >
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="聽錯的字，如 安批威" aria-label="聽錯的字" className="h-9 min-w-0 rounded-control border border-border bg-surface px-2.5 text-sm" />
            <span className="text-secondary text-sm" aria-hidden="true">→</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="正確的字，如 NPV" aria-label="正確的字" className="h-9 min-w-0 rounded-control border border-border bg-surface px-2.5 text-sm" />
            <Button type="submit" variant="primary" size="md" icon="plus" iconOnly aria-label="新增規則" disabled={!from.trim() || !to.trim()} />
          </form>
          <ul className="divide-y divide-border rounded-container border border-border max-h-56 overflow-y-auto">
            {rules.length === 0 && <li className="p-3 text-xs text-secondary">還沒有規則。可以從下方的建議清單加入，或在編輯段落後一鍵建立。</li>}
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Toggle on={r.enabled} onChange={(v) => onToggleRule(r.id, v)} label={`${r.from} 改為 ${r.to}`} small />
                <span className={r.enabled ? "" : "text-secondary"}>{r.from} <span className="text-secondary">→</span> {r.to}</span>
                <button type="button" aria-label="刪除規則" onClick={() => onRemoveRule(r.id)} className="ml-auto text-secondary hover:text-primary"><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer text-secondary">建議清單（預設不啟用）</summary>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_RULES.filter((s) => !rules.some((r) => r.from === s.from)).map((s) => (
                <li key={s.from}>
                  <button type="button" onClick={() => onAddRule(s.from, s.to, false)} className="h-7 px-2.5 rounded-full border border-border text-xs hover:bg-surface-2">
                    {s.from} → {s.to}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Dialog>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-secondary mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, label, busy, small }: { on: boolean; onChange: (v: boolean) => void; label: string; busy?: boolean; small?: boolean }) {
  const h = small ? "h-5 w-9" : "h-6 w-11";
  const knob = small ? "h-4 w-4" : "h-5 w-5";
  const shift = small ? "translate-x-[18px]" : "translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`relative ${h} rounded-full transition-colors duration-150 ${on ? "bg-brand" : "bg-border"} ${busy ? "opacity-60" : ""}`}
    >
      <span className={`absolute top-0.5 ${knob} rounded-full bg-white shadow transition-transform duration-150 ${on ? shift : "translate-x-0.5"}`} />
    </button>
  );
}
