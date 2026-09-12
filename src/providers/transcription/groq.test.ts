import { describe, expect, it, vi } from "vitest";
import { GroqProvider, testGroqKey } from "./groq";
import type { TranscriptionEvent } from "./types";

const SR = 16000;
function tone(ms: number) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SR);
  return out;
}
function quiet(ms: number) {
  return new Float32Array(Math.round((SR * ms) / 1000));
}

function makeProvider(fetchImpl: typeof fetch, apiKey = "gsk_test") {
  let push: ((f: Float32Array) => void) | null = null;
  const p = new GroqProvider({
    apiKey,
    workletUrl: "/x",
    fetchImpl,
    backoffMs: 1,
    toTraditional: (s) => s.replace("这", "這"),
    captureFactory: async (_stream, onFrames) => {
      push = onFrames;
      return { sampleRate: SR, stop() {} };
    },
  });
  const events: TranscriptionEvent[] = [];
  p.subscribe((e) => events.push(e));
  return { p, events, feed: (a: Float32Array) => push?.(a) };
}

const okResponse = (text: string) => new Response(JSON.stringify({ text }), { status: 200, headers: { "content-type": "application/json" } });

describe("GroqProvider", () => {
  it("沒有金鑰就直接發錯誤不開麥克風", async () => {
    const { p, events } = makeProvider(vi.fn(), "");
    await expect(p.start({ stream: {} as MediaStream, languageMode: "mixed", phrases: [] })).rejects.toThrow();
    expect((events[0] as { error: { code: string } }).error.code).toBe("groq-key-missing");
  });

  it("停頓切段後上傳 WAV，帶語言與詞彙提示，結果轉成繁體", async () => {
    const calls: Array<{ url: string; form: FormData; auth: string }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, form: init!.body as FormData, auth: (init!.headers as Record<string, string>).Authorization });
      return okResponse("这家公司的 operating margin 很高");
    }) as unknown as typeof fetch;
    const { p, events, feed } = makeProvider(fetchImpl);
    await p.start({ stream: {} as MediaStream, languageMode: "mixed", phrases: ["WACC", "EBITDA"] });
    feed(quiet(500));
    feed(tone(2000));
    feed(quiet(1000));
    await p.stop();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/audio/transcriptions");
    expect(calls[0].auth).toBe("Bearer gsk_test");
    expect(calls[0].form.get("model")).toBe("whisper-large-v3-turbo");
    expect(calls[0].form.get("language")).toBe("zh");
    expect(String(calls[0].form.get("prompt"))).toContain("WACC");
    const file = calls[0].form.get("file") as Blob;
    expect(file.type).toBe("audio/wav");
    expect(file.size).toBeGreaterThan(44 + 2 * SR * 2);
    const final = events.find((e) => e.type === "final") as { text: string; atMs: number };
    expect(final.text).toBe("這家公司的 operating margin 很高");
  });

  it("401 會發出金鑰無效的持續性錯誤並停止", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const { p, events, feed } = makeProvider(fetchImpl);
    await p.start({ stream: {} as MediaStream, languageMode: "zh", phrases: [] });
    feed(tone(2000));
    feed(quiet(1000));
    await p.stop();
    const err = events.find((e) => e.type === "error") as { error: { code: string } };
    expect(err.error.code).toBe("groq-key-invalid");
  });

  it("429 會退避重試，成功後仍然送出結果", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (n++ === 0 ? new Response("", { status: 429 }) : okResponse("second try"))) as unknown as typeof fetch;
    const { p, events, feed } = makeProvider(fetchImpl);
    await p.start({ stream: {} as MediaStream, languageMode: "en", phrases: [] });
    feed(tone(2000));
    feed(quiet(1000));
    await p.stop();
    expect(n).toBe(2);
    expect(events.some((e) => e.type === "final" && (e as { text: string }).text === "second try")).toBe(true);
  });

  it("網路一直失敗會先 dropped，連續多段失敗後才放棄", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const { p, events, feed } = makeProvider(fetchImpl);
    await p.start({ stream: {} as MediaStream, languageMode: "zh", phrases: [] });
    for (let i = 0; i < 4; i++) {
      feed(tone(1500));
      feed(quiet(1000));
    }
    await p.stop();
    expect(events.filter((e) => e.type === "dropped").length).toBe(3);
    expect((events.find((e) => e.type === "error") as { error: { code: string } }).error.code).toBe("groq-unreachable");
  });

  it("幻覺句不會被送出", async () => {
    const fetchImpl = vi.fn(async () => okResponse("謝謝觀看")) as unknown as typeof fetch;
    const { p, events, feed } = makeProvider(fetchImpl);
    await p.start({ stream: {} as MediaStream, languageMode: "zh", phrases: [] });
    feed(tone(2000));
    feed(quiet(1000));
    await p.stop();
    expect(events.some((e) => e.type === "final")).toBe(false);
  });
});

describe("testGroqKey", () => {
  it("依狀態碼分類", async () => {
    expect(await testGroqKey("k", vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch)).toBe("ok");
    expect(await testGroqKey("k", vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch)).toBe("invalid");
    expect(await testGroqKey("k", vi.fn(async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBe("network");
  });
});
