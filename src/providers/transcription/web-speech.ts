/**
 * 快速模式：瀏覽器內建 SpeechRecognition。
 *
 * Chrome 的實作有幾個必須處理的習性：
 * - 靜音一段時間或大約一分鐘後會自己觸發 onend，這是常態，要在仍想聆聽時立刻重啟。
 * - start() 在已啟動的 instance 上再呼叫會丟 InvalidStateError，所以用 desired 狀態 + starting 旗標守門。
 * - 重啟後 event.results 會從頭算，必須用 resultIndex 只讀新結果，否則 final 會重複加入。
 * - 音訊會送到瀏覽器供應商的伺服器辨識，UI 要誠實說明（不在這個檔案裡，但這是它存在的原因）。
 */
import { ERRORS } from "@/lib/errors";
import { getSpeechRecognitionCtor } from "@/lib/capability";
import type { LanguageMode } from "@/lib/types";
import { Emitter, type StartOptions, type TranscriptionProvider } from "./types";

type Desired = "stopped" | "listening" | "paused";

const RESTART_DELAY_MS = 150;
const FAILURE_WINDOW_MS = 4000;
const MAX_FAST_FAILURES = 4;

function langFor(mode: LanguageMode): string {
  // 中英混合沒有原生選項：用 zh-TW 當底層語言，Chrome 的中文模型對常見英文詞有一定容忍度
  return mode === "en" ? "en-US" : "zh-TW";
}

export class WebSpeechProvider implements TranscriptionProvider {
  readonly engine = "web-speech" as const;
  readonly needsNetwork = true;
  private emitter = new Emitter();
  private recognition: SpeechRecognition | null = null;
  private desired: Desired = "stopped";
  private starting = false;
  private running = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStartAt = 0;
  private fastFailures = 0;
  private lang = "zh-TW";
  private phrases: string[] = [];
  /** 上一次 onstart 之後有沒有拿到過結果；沒有的話 onend 很可能是靜音逾時 */
  private gotResultSinceStart = false;

  subscribe(l: Parameters<Emitter["subscribe"]>[0]) {
    return this.emitter.subscribe(l);
  }

  async start(opts: StartOptions): Promise<void> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.emitter.emit({ type: "error", error: ERRORS.speechUnsupported() });
      throw new Error("speech-unsupported");
    }
    this.lang = langFor(opts.languageMode);
    this.phrases = opts.phrases;
    if (!this.recognition) this.recognition = this.build(Ctor);
    this.desired = "listening";
    this.fastFailures = 0;
    this.safeStart();
  }

  /** 課堂中切換底層語言：停掉再用新語言重啟，不建立第二個 instance */
  setLanguageMode(mode: LanguageMode) {
    const next = langFor(mode);
    if (next === this.lang) return;
    this.lang = next;
    if (this.recognition) this.recognition.lang = next;
    if (this.desired === "listening" && this.running) this.recognition?.stop();
  }

  pause() {
    if (this.desired !== "listening") return;
    this.desired = "paused";
    this.clearRestart();
    this.recognition?.stop();
    this.emitter.emit({ type: "interim", text: "" });
  }

  resume() {
    if (this.desired !== "paused") return;
    this.desired = "listening";
    this.fastFailures = 0;
    this.safeStart();
  }

  async stop(): Promise<void> {
    this.desired = "stopped";
    this.clearRestart();
    const r = this.recognition;
    if (r) {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      r.onstart = null;
      try {
        r.abort();
      } catch {
        /* 已經停了 */
      }
    }
    this.recognition = null;
    this.running = false;
    this.starting = false;
  }

  private build(Ctor: new () => SpeechRecognition): SpeechRecognition {
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.lang = this.lang;
    this.applyPhrases(r);
    r.onstart = () => {
      this.running = true;
      this.starting = false;
      this.gotResultSinceStart = false;
      this.lastStartAt = Date.now();
    };
    r.onresult = (e: SpeechRecognitionEvent) => {
      this.gotResultSinceStart = true;
      this.fastFailures = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          const clean = text.trim();
          if (clean) this.emitter.emit({ type: "final", text: clean, atMs: Date.now() });
        } else {
          interim += text;
        }
      }
      this.emitter.emit({ type: "interim", text: interim.trim() });
    };
    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      // no-speech 與 aborted 是正常流程，onend 會接著來，交給 onend 處理重啟
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.desired = "stopped";
        this.emitter.emit({ type: "error", error: ERRORS.permissionDenied() });
        return;
      }
      if (e.error === "audio-capture") {
        this.desired = "stopped";
        this.emitter.emit({ type: "error", error: ERRORS.noMicrophone() });
        return;
      }
      if (e.error === "network") {
        this.emitter.emit({ type: "dropped", reason: "network" });
        return;
      }
      this.emitter.emit({ type: "dropped", reason: e.error });
    };
    r.onend = () => {
      this.running = false;
      this.starting = false;
      this.emitter.emit({ type: "interim", text: "" });
      if (this.desired !== "listening") return;
      // 很快就結束又沒有任何結果，代表辨識服務有問題而不是單純靜音逾時
      const quick = Date.now() - this.lastStartAt < FAILURE_WINDOW_MS && !this.gotResultSinceStart;
      if (quick) this.fastFailures += 1;
      if (this.fastFailures >= MAX_FAST_FAILURES) {
        this.desired = "stopped";
        this.emitter.emit({ type: "error", error: typeof navigator !== "undefined" && navigator.onLine === false ? ERRORS.networkLost() : ERRORS.recognitionFailed() });
        return;
      }
      this.emitter.emit({ type: "dropped", reason: quick ? "quick-end" : "timeout" });
      this.scheduleRestart();
    };
    return r;
  }

  private applyPhrases(r: SpeechRecognition) {
    // Chrome 的 contextual biasing：有就用，沒有就當作沒這回事
    const w = globalThis as unknown as { SpeechRecognitionPhrase?: new (phrase: string, boost?: number) => unknown };
    if (!w.SpeechRecognitionPhrase || this.phrases.length === 0) return;
    try {
      const list = this.phrases.slice(0, 100).map((p) => new w.SpeechRecognitionPhrase!(p, 2.0));
      (r as unknown as { phrases?: unknown }).phrases = list;
    } catch {
      /* 不支援就略過 */
    }
  }

  private scheduleRestart() {
    this.clearRestart();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.desired === "listening") this.safeStart();
    }, RESTART_DELAY_MS);
  }

  private clearRestart() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private safeStart() {
    const r = this.recognition;
    if (!r || this.starting || this.running || this.desired !== "listening") return;
    this.starting = true;
    try {
      r.start();
      if (this.lastStartAt > 0) this.emitter.emit({ type: "recovered" });
    } catch (err) {
      this.starting = false;
      const name = (err as Error)?.name;
      if (name === "InvalidStateError") {
        // 已經在跑（通常是 onend 與我們的重啟撞在一起），等它自己 onend 再說
        this.running = true;
        return;
      }
      this.emitter.emit({ type: "error", error: ERRORS.unknown((err as Error)?.message ?? "start failed") });
    }
  }
}
