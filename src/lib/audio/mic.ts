/**
 * 麥克風：取得串流、音量計、以及給本機模型用的 16 kHz 單聲道 PCM。
 * 每個函式都回傳 stop()，停止時一定要釋放 track 與 AudioContext，否則瀏覽器的
 * 「正在使用麥克風」紅點不會消失，而且下一次 getUserMedia 可能失敗。
 */

export const TARGET_SAMPLE_RATE = 16000;

export async function openMicrophone(deviceId?: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
}

export interface LevelMeter {
  /** 0–1 的目前音量 */
  getLevel(): number;
  stop(): void;
}

/** 音量計只用來顯示「麥克風有沒有聲音」，不做任何分析 */
export function createLevelMeter(stream: MediaStream): LevelMeter {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return {
    getLevel() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // 人聲 RMS 大約 0.02–0.2，乘上去讓指示條看得到變化
      return Math.min(1, rms * 6);
    },
    stop() {
      source.disconnect();
      ctx.close().catch(() => {});
    },
  };
}

export interface PcmCapture {
  stop(): void;
  sampleRate: number;
}

/**
 * 以 16 kHz 取樣麥克風，交給 onFrames。
 * AudioContext 指定 sampleRate 後瀏覽器會自己重取樣，省掉手寫 resampler。
 * AudioWorklet 載入失敗（例如 basePath 錯）時退回 ScriptProcessor，功能一樣只是在主執行緒跑。
 */
export async function createPcmCapture(stream: MediaStream, onFrames: (frames: Float32Array) => void, workletUrl: string): Promise<PcmCapture> {
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  const source = ctx.createMediaStreamSource(stream);
  let cleanup: () => void;
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrames(e.data);
    source.connect(node);
    cleanup = () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
    };
  } catch {
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => onFrames(e.inputBuffer.getChannelData(0).slice());
    source.connect(proc);
    // ScriptProcessor 不接到 destination 就不會跑，接了但沒輸出所以不會有回音
    proc.connect(ctx.destination);
    cleanup = () => {
      proc.onaudioprocess = null;
      source.disconnect();
      proc.disconnect();
    };
  }
  return {
    sampleRate: ctx.sampleRate,
    stop() {
      cleanup();
      ctx.close().catch(() => {});
    },
  };
}

export function rms(frames: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frames.length; i++) sum += frames[i] * frames[i];
  return Math.sqrt(sum / Math.max(1, frames.length));
}
