/** 把 16 kHz 單聲道 Float32 PCM 包成 16-bit WAV，給雲端辨識 API 用。不壓縮，20 秒約 640 KB。 */
export function encodeWav(pcm: Float32Array, sampleRate = 16000): ArrayBuffer {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + pcm.length * bytesPerSample);
  const view = new DataView(buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * bytesPerSample, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, pcm.length * bytesPerSample, true);
  let o = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
    o += 2;
  }
  return buffer;
}
