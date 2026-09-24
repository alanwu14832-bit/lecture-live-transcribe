/**
 * 講者分離模型檔的下載與快取。檔案來自 Hugging Face（公開、允許跨網域），
 * 下載後放進瀏覽器的 Cache API，之後開課不用再抓。
 */

export const NEMOTRON_REPO_DEFAULT = "https://huggingface.co/onnx-community/Nemotron-3-Diarization-ONNX/resolve/main/onnx";
/** 學校網路擋 Hugging Face 時可以自架鏡像：在 localStorage 設 casenote:nemotron-base 指到放 model_q4.onnx 的資料夾 */
export let NEMOTRON_REPO = NEMOTRON_REPO_DEFAULT;
export function setNemotronRepo(base: string | null | undefined) {
  NEMOTRON_REPO = base?.trim().replace(/\/$/, "") || NEMOTRON_REPO_DEFAULT;
}
export const NEMOTRON_MODEL_FILE = "model_q4.onnx";
export const NEMOTRON_DATA_FILE = "model_q4.onnx_data";
const CACHE_NAME = "casenote-nemotron-v1";

export interface DownloadProgress {
  loaded: number;
  /** 0 代表伺服器沒給大小 */
  total: number;
  file: string;
}

export async function isNemotronCached(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open(CACHE_NAME);
    const a = await cache.match(`${NEMOTRON_REPO}/${NEMOTRON_MODEL_FILE}`);
    const b = await cache.match(`${NEMOTRON_REPO}/${NEMOTRON_DATA_FILE}`);
    return !!a && !!b;
  } catch {
    return false;
  }
}

export async function clearNemotronCache() {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* 沒有就算了 */
  }
}

async function fetchWithProgress(url: string, file: string, onProgress: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const cache = typeof caches !== "undefined" ? await caches.open(CACHE_NAME).catch(() => null) : null;
  const hit = cache ? await cache.match(url) : null;
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    onProgress({ loaded: buf.length, total: buf.length, file });
    return buf;
  }
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`下載失敗：${res.status} ${file}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress({ loaded, total, file });
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  if (cache) await cache.put(url, new Response(out.slice().buffer, { headers: { "content-type": "application/octet-stream" } })).catch(() => {});
  return out;
}

/** 回傳模型圖與權重；progress 是兩個檔案加總 */
export async function loadNemotronFiles(onProgress: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<{ model: Uint8Array; data: Uint8Array }> {
  const totals: Record<string, DownloadProgress> = {};
  const report = (p: DownloadProgress) => {
    totals[p.file] = p;
    const all = Object.values(totals);
    onProgress({
      loaded: all.reduce((n, x) => n + x.loaded, 0),
      total: all.every((x) => x.total > 0) ? all.reduce((n, x) => n + x.total, 0) : 0,
      file: p.file,
    });
  };
  const model = await fetchWithProgress(`${NEMOTRON_REPO}/${NEMOTRON_MODEL_FILE}`, NEMOTRON_MODEL_FILE, report, signal);
  const data = await fetchWithProgress(`${NEMOTRON_REPO}/${NEMOTRON_DATA_FILE}`, NEMOTRON_DATA_FILE, report, signal);
  return { model, data };
}
