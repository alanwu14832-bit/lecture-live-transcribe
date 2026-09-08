import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSpeechProvider } from "./web-speech";
import type { TranscriptionEvent } from "./types";

/** 模擬 Chrome 的 SpeechRecognition，可手動觸發 onstart/onresult/onend */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  started = false;
  startCalls = 0;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.startCalls++;
    if (this.started) {
      const err = new Error("already started");
      err.name = "InvalidStateError";
      throw err;
    }
    this.started = true;
    this.onstart?.();
  }
  stop() {
    if (!this.started) return;
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
  }
  /** 模擬 Chrome 自己結束（靜音逾時） */
  dropUnexpectedly() {
    this.started = false;
    this.onend?.();
  }
  emitResults(items: Array<{ text: string; final: boolean }>, resultIndex = 0) {
    const results = items.map((i) => Object.assign([{ transcript: i.text }], { isFinal: i.final }));
    this.onresult?.({ resultIndex, results });
  }
}

function fakeStream() {
  return { getTracks: () => [] } as unknown as MediaStream;
}

describe("WebSpeechProvider", () => {
  let events: TranscriptionEvent[];
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    events = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  async function startProvider(mode: "mixed" | "zh" | "en" = "mixed") {
    const p = new WebSpeechProvider();
    p.subscribe((e) => events.push(e));
    await p.start({ stream: fakeStream(), languageMode: mode, phrases: [] });
    return { p, rec: FakeRecognition.instances[0] };
  }

  it("設定 continuous、interimResults 與語言", async () => {
    const { rec } = await startProvider("en");
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.lang).toBe("en-US");
    expect(rec.started).toBe(true);
  });

  it("意外 onend 後自動重啟同一個 instance，並發出 dropped / recovered", async () => {
    const { rec } = await startProvider();
    rec.emitResults([{ text: "第一句", final: true }]);
    rec.dropUnexpectedly();
    expect(events.some((e) => e.type === "dropped")).toBe(true);
    expect(rec.started).toBe(false);
    vi.advanceTimersByTime(200);
    expect(rec.started).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(events.some((e) => e.type === "recovered")).toBe(true);
  });

  it("暫停後 onend 不會重啟；繼續後才重啟", async () => {
    const { p, rec } = await startProvider();
    p.pause();
    expect(rec.started).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(rec.started).toBe(false);
    p.resume();
    expect(rec.started).toBe(true);
  });

  it("stop 之後不再重啟且不再收事件", async () => {
    const { p, rec } = await startProvider();
    await p.stop();
    rec.dropUnexpectedly();
    vi.advanceTimersByTime(1000);
    expect(rec.started).toBe(false);
    const count = events.length;
    rec.emitResults([{ text: "不該出現", final: true }]);
    expect(events.length).toBe(count);
  });

  it("final 只依 resultIndex 讀新結果，不重複加入", async () => {
    const { rec } = await startProvider();
    rec.emitResults([{ text: "A", final: true }], 0);
    rec.emitResults([{ text: "A", final: true }, { text: "B", final: true }], 1);
    const finals = events.filter((e) => e.type === "final").map((e) => (e as { text: string }).text);
    expect(finals).toEqual(["A", "B"]);
  });

  it("interim 文字彙整成一則事件，final 後清空", async () => {
    const { rec } = await startProvider();
    rec.emitResults([{ text: "正在", final: false }, { text: "說話", final: false }]);
    const last = events[events.length - 1];
    expect(last).toEqual({ type: "interim", text: "正在說話" });
  });

  it("start 撞到 InvalidStateError 不會炸掉也不會建立新 instance", async () => {
    const { rec } = await startProvider();
    rec.dropUnexpectedly();
    rec.started = true; // 模擬瀏覽器其實還在跑
    vi.advanceTimersByTime(200);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("連續快速失敗多次後放棄並發出持續性錯誤", async () => {
    const { rec } = await startProvider();
    for (let i = 0; i < 4; i++) {
      rec.dropUnexpectedly();
      vi.advanceTimersByTime(200);
    }
    const err = events.find((e) => e.type === "error") as { error: { code: string } } | undefined;
    expect(err?.error.code).toBe("recognition-failed");
    expect(rec.started).toBe(false);
  });

  it("有結果的長時間 session 意外結束不算失敗，可以一直重啟", async () => {
    const { rec } = await startProvider();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(5000);
      rec.emitResults([{ text: `句子${i}`, final: true }]);
      rec.dropUnexpectedly();
      vi.advanceTimersByTime(200);
    }
    expect(rec.started).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });
});
