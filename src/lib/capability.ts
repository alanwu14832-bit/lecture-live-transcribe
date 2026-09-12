/**
 * 功能偵測。所有結果都是「這台裝置現在能不能」，不猜、不快取跨次結果。
 */

export interface Capabilities {
  secureContext: boolean;
  mediaDevices: boolean;
  speechRecognition: boolean;
  /** Chrome 的 contextual phrase biasing（SpeechRecognitionPhrase） */
  speechPhrases: boolean;
  webgpu: boolean;
  wasm: boolean;
  indexedDB: boolean;
  translator: boolean;
  languageDetector: boolean;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export async function detectCapabilities(): Promise<Capabilities> {
  if (typeof window === "undefined") {
    return { secureContext: false, mediaDevices: false, speechRecognition: false, speechPhrases: false, webgpu: false, wasm: false, indexedDB: false, translator: false, languageDetector: false };
  }
  let webgpu = false;
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu) webgpu = (await gpu.requestAdapter()) != null;
  } catch {
    webgpu = false;
  }
  const w = window as unknown as Record<string, unknown>;
  return {
    secureContext: window.isSecureContext,
    mediaDevices: !!navigator.mediaDevices?.getUserMedia,
    speechRecognition: getSpeechRecognitionCtor() != null,
    speechPhrases: "SpeechRecognitionPhrase" in w,
    webgpu,
    wasm: typeof WebAssembly !== "undefined",
    indexedDB: typeof indexedDB !== "undefined",
    translator: "Translator" in w,
    languageDetector: "LanguageDetector" in w,
  };
}

/**
 * 依裝置能力給引擎建議。
 * 有 Groq 金鑰就推薦它：品質最高、不吃本機算力；中英混合且有 WebGPU 才推薦本機模型。
 */
export function recommendEngine(caps: Capabilities, mode: "mixed" | "zh" | "en", hasGroqKey = false): "web-speech" | "whisper" | "groq" {
  if (hasGroqKey) return "groq";
  if (mode === "mixed" && caps.webgpu && caps.wasm) return "whisper";
  if (caps.speechRecognition) return "web-speech";
  return caps.wasm ? "whisper" : "web-speech";
}
