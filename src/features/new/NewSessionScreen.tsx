"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { usePrefs } from "@/components/PrefsProvider";
import { MicTest } from "./MicTest";
import { detectCapabilities, recommendEngine, type Capabilities } from "@/lib/capability";
import { addGlossaryTerm, createSession } from "@/lib/db";
import { ENGINE_LABELS, LANGUAGE_MODE_LABELS, type Engine, type LanguageMode } from "@/lib/types";

const MODE_HELP: Record<LanguageMode, string> = {
  mixed: "教授中文為主、句子裡夾英文術語。推薦本機雙語辨識。",
  zh: "幾乎全中文授課。快速模式就很夠用。",
  en: "全英文授課。快速模式的英文辨識很穩定。",
};

export function NewSessionScreen() {
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<LanguageMode>(prefs.lastLanguageMode);
  const [notesOpen, setNotesOpen] = useState(prefs.notesOpen);
  const [glossaryText, setGlossaryText] = useState("");
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [engineTouched, setEngineTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    detectCapabilities().then(setCaps);
  }, []);

  const recommended = useMemo(() => (caps ? recommendEngine(caps, mode) : null), [caps, mode]);
  useEffect(() => {
    if (recommended && !engineTouched) setEngine(recommended);
  }, [recommended, engineTouched]);

  const noEngine = caps != null && !caps.speechRecognition && !caps.wasm;
  const insecure = caps != null && !caps.secureContext;

  async function submit() {
    if (!engine || submitting) return;
    setSubmitting(true);
    try {
      const session = await createSession({ title, languageMode: mode, transcriptionEngine: engine, notesOpen });
      const terms = glossaryText.split(/[\n,，、]/).map((t) => t.trim()).filter(Boolean);
      for (const t of terms) await addGlossaryTerm(t, session.id);
      update({ lastLanguageMode: mode, lastEngine: engine, notesOpen });
      router.push(`/live?id=${session.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader backHref="/" title="建立課堂" />
      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8 flex-1">
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1.5">課程名稱</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：財務管理 W3 企業評價"
              autoFocus
              className="w-full h-11 rounded-control border border-border bg-surface px-3 text-[15px] placeholder:text-secondary/70"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium mb-2">語言模式</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(LANGUAGE_MODE_LABELS) as LanguageMode[]).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-container border p-3 transition-colors duration-150 ${mode === m ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-surface-2"}`}
                >
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => { setMode(m); setEngineTouched(false); }} className="sr-only" />
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{LANGUAGE_MODE_LABELS[m]}</span>
                    {m === "mixed" && <span className="text-[11px] text-brand font-medium">推薦</span>}
                  </div>
                  <p className="text-xs text-secondary mt-1 leading-relaxed">{MODE_HELP[m]}</p>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium mb-2">辨識方式</legend>
            {caps == null ? (
              <div className="h-24 rounded-container border border-border bg-surface animate-pulse" />
            ) : insecure ? (
              <Notice tone="warning" title="需要 HTTPS 才能使用麥克風" body="請用 https:// 或 localhost 開啟本站。" />
            ) : noEngine ? (
              <Notice tone="warning" title="這個瀏覽器無法轉錄" body="它既沒有內建語音辨識，也不支援 WebAssembly。請改用最新版的 Chrome 或 Edge。" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <EngineCard
                  engine="whisper"
                  selected={engine === "whisper"}
                  recommended={recommended === "whisper"}
                  disabled={!caps.wasm}
                  onSelect={() => { setEngine("whisper"); setEngineTouched(true); }}
                  lines={[
                    "音訊留在這台裝置，不需要網路",
                    "同一句話中英切換的辨識較準",
                    caps.webgpu ? "第一次要下載模型，之後有數秒延遲" : "這台裝置沒有 WebGPU，延遲可能到十幾秒",
                  ]}
                />
                <EngineCard
                  engine="web-speech"
                  selected={engine === "web-speech"}
                  recommended={recommended === "web-speech"}
                  disabled={!caps.speechRecognition}
                  onSelect={() => { setEngine("web-speech"); setEngineTouched(true); }}
                  lines={[
                    "30 秒內就能開始，延遲最低",
                    "音訊會送到瀏覽器供應商的伺服器辨識（Chrome 是 Google）",
                    mode === "mixed" ? "同一句內中英切換可能較不準" : "需要網路連線",
                  ]}
                />
              </div>
            )}
          </fieldset>

          <div className="flex items-center justify-between rounded-container border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-medium">開啟個人筆記側欄</p>
              <p className="text-xs text-secondary mt-0.5">上課時在右側快速記下自己的想法，與逐字稿分開存放。</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notesOpen}
              onClick={() => setNotesOpen((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${notesOpen ? "bg-brand" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${notesOpen ? "translate-x-5" : "translate-x-0.5"}`} />
              <span className="sr-only">個人筆記側欄</span>
            </button>
          </div>

          <div>
            <label htmlFor="glossary" className="block text-sm font-medium mb-1.5">
              課程詞彙 <span className="text-secondary font-normal">（選填）</span>
            </label>
            <textarea
              id="glossary"
              value={glossaryText}
              onChange={(e) => setGlossaryText(e.target.value)}
              rows={3}
              placeholder="這堂課會出現的術語，用逗號或換行分隔。例如：terminal value, CAPM, 資本結構"
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm placeholder:text-secondary/70"
            />
            <p className="text-xs text-secondary mt-1">支援的引擎會把這些詞當作辨識提示；不支援時不影響轉錄。</p>
          </div>

          <MicTest />

          <PrivacyNotice />

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" variant="primary" size="lg" icon="mic" disabled={!engine || noEngine || insecure || submitting}>
              開始轉錄
            </Button>
            <span className="text-xs text-secondary">
              {engine && <>將使用 {ENGINE_LABELS[engine]}</>}
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}

function EngineCard({ engine, selected, recommended, disabled, onSelect, lines }: { engine: Engine; selected: boolean; recommended: boolean; disabled: boolean; onSelect: () => void; lines: string[] }) {
  return (
    <label className={`rounded-container border p-3 transition-colors duration-150 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${selected ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-surface-2"}`}>
      <input type="radio" name="engine" value={engine} checked={selected} disabled={disabled} onChange={onSelect} className="sr-only" />
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{ENGINE_LABELS[engine]}</span>
        {recommended && !disabled && <span className="text-[11px] text-brand font-medium">推薦</span>}
        {disabled && <span className="text-[11px] text-secondary">此瀏覽器不支援</span>}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-xs text-secondary">
        {lines.map((l) => (
          <li key={l} className="flex gap-1.5"><span aria-hidden="true">·</span>{l}</li>
        ))}
      </ul>
    </label>
  );
}

function Notice({ tone, title, body }: { tone: "warning" | "info"; title: string; body: string }) {
  return (
    <div className={`rounded-container border border-border p-4 text-sm ${tone === "warning" ? "bg-warning-soft" : "bg-surface"}`}>
      <p className="font-medium inline-flex items-center gap-1 mb-1"><Icon name={tone === "warning" ? "alert" : "info"} size={15} /> {title}</p>
      <p className="text-secondary">{body}</p>
    </div>
  );
}
