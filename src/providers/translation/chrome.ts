/**
 * 選配對照翻譯：Chrome 內建 Translator API（Chrome 138+，模型在本機跑）。
 * 只是顯示層：原始逐字稿永遠不動，譯文另存在 segment.translation。
 * 瀏覽器沒有這個 API 就回 null，UI 連開關都不顯示。
 */
import type { DetectedLanguage } from "@/lib/types";

type Availability = "unavailable" | "downloadable" | "downloading" | "available";

interface Monitor {
  addEventListener(type: "downloadprogress", cb: (e: { loaded: number; total?: number }) => void): void;
}

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?(): void;
}

interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(opts: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<TranslatorInstance>;
}

interface DetectorInstance {
  detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}

interface DetectorStatic {
  availability(): Promise<Availability>;
  create(opts?: { monitor?: (m: Monitor) => void }): Promise<DetectorInstance>;
}

export type TranslationDirection = "zh-en" | "en-zh";

export interface TranslationProvider {
  availability(): Promise<Record<TranslationDirection, Availability>>;
  /** 準備兩個方向的翻譯器，回報下載進度 0–1 */
  prepare(onProgress?: (p: number) => void): Promise<void>;
  translate(text: string, hint: DetectedLanguage): Promise<{ lang: "zh" | "en"; text: string } | null>;
  destroy(): void;
}

const ZH = "zh-Hant";
const EN = "en";

function api() {
  const g = globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };
  return { Translator: g.Translator ?? null, LanguageDetector: g.LanguageDetector ?? null };
}

export function isTranslationSupported(): boolean {
  return api().Translator != null;
}

export function createChromeTranslation(): TranslationProvider | null {
  const { Translator, LanguageDetector } = api();
  if (!Translator) return null;
  const cache = new Map<TranslationDirection, TranslatorInstance>();
  let detector: DetectorInstance | null = null;

  async function get(dir: TranslationDirection, onProgress?: (p: number) => void) {
    const hit = cache.get(dir);
    if (hit) return hit;
    const [sourceLanguage, targetLanguage] = dir === "zh-en" ? [ZH, EN] : [EN, ZH];
    const t = await Translator!.create({
      sourceLanguage,
      targetLanguage,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => onProgress?.(e.total ? e.loaded / e.total : e.loaded));
      },
    });
    cache.set(dir, t);
    return t;
  }

  async function detect(text: string): Promise<"zh" | "en" | null> {
    if (!LanguageDetector) return null;
    try {
      detector ??= await LanguageDetector.create();
      const [top] = await detector.detect(text);
      if (!top || top.confidence < 0.5) return null;
      if (top.detectedLanguage.startsWith("zh")) return "zh";
      if (top.detectedLanguage.startsWith("en")) return "en";
      return null;
    } catch {
      return null;
    }
  }

  return {
    async availability() {
      const [a, b] = await Promise.all([
        Translator!.availability({ sourceLanguage: ZH, targetLanguage: EN }).catch(() => "unavailable" as const),
        Translator!.availability({ sourceLanguage: EN, targetLanguage: ZH }).catch(() => "unavailable" as const),
      ]);
      return { "zh-en": a, "en-zh": b };
    },
    async prepare(onProgress) {
      let a = 0;
      let b = 0;
      await Promise.all([
        get("zh-en", (p) => { a = p; onProgress?.((a + b) / 2); }),
        get("en-zh", (p) => { b = p; onProgress?.((a + b) / 2); }),
      ]);
      onProgress?.(1);
    },
    async translate(text, hint) {
      const clean = text.trim();
      if (!clean) return null;
      // 中英混合一律翻成英文：學生最需要的是把整句中文意思看懂，英文術語本來就是英文
      let source: "zh" | "en" | null = hint === "zh" || hint === "mixed" ? "zh" : hint === "en" ? "en" : null;
      source ??= await detect(clean);
      if (!source) return null;
      const dir: TranslationDirection = source === "zh" ? "zh-en" : "en-zh";
      const t = await get(dir);
      const out = await t.translate(clean);
      return { lang: source === "zh" ? "en" : "zh", text: out.trim() };
    },
    destroy() {
      for (const t of cache.values()) t.destroy?.();
      cache.clear();
    },
  };
}
