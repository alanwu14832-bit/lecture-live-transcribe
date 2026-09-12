/**
 * 能量式語音活動偵測（VAD）分段器。
 *
 * 目的：把連續麥克風音訊在「講者停頓」的地方切開，讓送去辨識的每一段都是完整句子。
 * Whisper 類模型在句子中間被硬切時表現最差，所以切在停頓比切在固定秒數準確得多。
 *
 * 做法刻意簡單：每 30 ms 算一次 RMS，動態估計背景噪音底噪，超過底噪數倍就當作有人在講話。
 * 不用神經網路 VAD 是為了不再多下載一個模型；教室空調這種穩定噪音用底噪估計就擋得住。
 */

export interface VadOptions {
  sampleRate?: number;
  /** 每一幀幾毫秒 */
  frameMs?: number;
  /** 講話結束後要安靜多久才切段 */
  endSilenceMs?: number;
  /** 一段最少要有多長的講話才送出 */
  minSpeechMs?: number;
  /** 一段最長多久，超過就在最近的低能量處硬切 */
  maxSegmentMs?: number;
  /** 講話開始前多保留多少音訊，避免吃掉第一個字 */
  preRollMs?: number;
  /** 絕對能量門檻；再安靜的教室也不會低於這個值被當成講話 */
  absThreshold?: number;
  /** 相對底噪的倍數 */
  noiseRatio?: number;
}

export interface VadSegment {
  audio: Float32Array;
  /** 這段的第一個樣本在整個串流中的位置 */
  startSample: number;
  endSample: number;
}

interface Frame {
  data: Float32Array;
  rms: number;
  startSample: number;
}

function rmsOf(a: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
}

export class VadSegmenter {
  private readonly sampleRate: number;
  private readonly frameSamples: number;
  private readonly endSilenceFrames: number;
  private readonly minSpeechFrames: number;
  private readonly maxSegmentFrames: number;
  private readonly preRollFrames: number;
  private readonly absThreshold: number;
  private readonly noiseRatio: number;

  private carry = new Float32Array(0);
  private totalSamples = 0;
  private noiseFloor = 0.002;
  private preRoll: Frame[] = [];
  private current: Frame[] = [];
  private speechFrames = 0;
  private trailingSilence = 0;
  private inSpeech = false;

  constructor(opts: VadOptions = {}) {
    this.sampleRate = opts.sampleRate ?? 16000;
    const frameMs = opts.frameMs ?? 30;
    this.frameSamples = Math.round((this.sampleRate * frameMs) / 1000);
    const f = (ms: number) => Math.max(1, Math.round(ms / frameMs));
    this.endSilenceFrames = f(opts.endSilenceMs ?? 700);
    this.minSpeechFrames = f(opts.minSpeechMs ?? 600);
    this.maxSegmentFrames = f(opts.maxSegmentMs ?? 20000);
    this.preRollFrames = f(opts.preRollMs ?? 300);
    this.absThreshold = opts.absThreshold ?? 0.006;
    this.noiseRatio = opts.noiseRatio ?? 3;
  }

  /** 餵入音訊，回傳這次完成的段落（可能零個或多個） */
  feed(input: Float32Array): VadSegment[] {
    const out: VadSegment[] = [];
    const buf = new Float32Array(this.carry.length + input.length);
    buf.set(this.carry, 0);
    buf.set(input, this.carry.length);
    let offset = 0;
    while (offset + this.frameSamples <= buf.length) {
      const data = buf.slice(offset, offset + this.frameSamples);
      const frame: Frame = { data, rms: rmsOf(data), startSample: this.totalSamples };
      this.totalSamples += this.frameSamples;
      offset += this.frameSamples;
      const seg = this.push(frame);
      if (seg) out.push(seg);
    }
    this.carry = buf.slice(offset);
    return out;
  }

  /** 暫停或結束時把手上的段落送出（太短就丟掉） */
  flush(): VadSegment | null {
    if (!this.inSpeech) {
      this.reset();
      return null;
    }
    const seg = this.speechFrames >= Math.ceil(this.minSpeechFrames / 2) ? this.emit() : null;
    this.reset();
    return seg;
  }

  private push(frame: Frame): VadSegment | null {
    const threshold = Math.max(this.absThreshold, this.noiseFloor * this.noiseRatio);
    const isSpeech = frame.rms > threshold;
    // 底噪只在安靜時往下追、慢慢往上回，講話時不更新，才不會把講話當成噪音
    if (!isSpeech) this.noiseFloor = this.noiseFloor * 0.95 + frame.rms * 0.05;
    else this.noiseFloor = Math.min(this.noiseFloor * 1.001, threshold);

    if (!this.inSpeech) {
      this.preRoll.push(frame);
      if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
      if (isSpeech) {
        this.inSpeech = true;
        this.current = [...this.preRoll];
        this.preRoll = [];
        this.speechFrames = 1;
        this.trailingSilence = 0;
      }
      return null;
    }

    this.current.push(frame);
    if (isSpeech) {
      this.speechFrames += 1;
      this.trailingSilence = 0;
    } else {
      this.trailingSilence += 1;
    }

    if (this.trailingSilence >= this.endSilenceFrames) {
      // 停頓夠久：講話太短就當雜音丟掉，否則送出
      const seg = this.speechFrames >= this.minSpeechFrames ? this.emit() : null;
      this.reset();
      return seg;
    }
    if (this.current.length >= this.maxSegmentFrames) {
      // 講太久沒停：在最後三秒裡能量最低的那一幀切開，剩下的當下一段開頭
      const window = Math.min(this.current.length - 1, Math.round(3000 / 30));
      let cut = this.current.length - 1;
      let lowest = Infinity;
      for (let i = this.current.length - window; i < this.current.length; i++) {
        if (this.current[i].rms < lowest) {
          lowest = this.current[i].rms;
          cut = i;
        }
      }
      const rest = this.current.slice(cut);
      this.current = this.current.slice(0, cut);
      const seg = this.emit();
      this.current = rest;
      this.speechFrames = rest.filter((f) => f.rms > threshold).length;
      this.trailingSilence = 0;
      return seg;
    }
    return null;
  }

  private emit(): VadSegment {
    const total = this.current.reduce((n, f) => n + f.data.length, 0);
    const audio = new Float32Array(total);
    let o = 0;
    for (const f of this.current) {
      audio.set(f.data, o);
      o += f.data.length;
    }
    const startSample = this.current[0]?.startSample ?? this.totalSamples;
    return { audio, startSample, endSample: startSample + total };
  }

  private reset() {
    this.inSpeech = false;
    this.current = [];
    this.speechFrames = 0;
    this.trailingSilence = 0;
    this.preRoll = [];
  }
}
