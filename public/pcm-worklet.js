// AudioWorklet：把麥克風的 PCM 幀原封不動丟回主執行緒。
// 放在 public/ 是因為 worklet 必須用獨立 URL 載入，不能被 webpack 打包進 bundle。
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice());
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
