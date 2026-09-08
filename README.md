# lecture-live-transcribe

個人用的課堂即時轉錄網頁：在教室電腦的 Chrome 打開，即時把教授講的話轉成文字，
可切換顯示原文／繁體中文／英文／中英對照。**全程免費，不需要 API 金鑰，沒有後端。**

產品名稱：**CaseNote**。

- 辨識：雙引擎，快速模式用 Chrome 內建 Web Speech API，本機雙語模式用瀏覽器內的 multilingual Whisper
- 翻譯：選配對照層，Chrome 內建 Translator API（本機模型，Chrome 138+），預設關閉，原文不動
- 儲存：IndexedDB 存資料，localStorage 存偏好，不保存原始錄音
- 技術：Next.js static export、TypeScript、Tailwind CSS

目前狀態：需求 v3 與架構已定案，程式尚未開始。

- 需求：[`PROMPT.md`](PROMPT.md)
- 架構與目錄結構：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 部署（GitHub Pages）

1. Repo → Settings → Pages → Source 選 **GitHub Actions**
2. 推上 main 後由 workflow 建置 static export 並發布
3. 網址是 `https://<帳號>.github.io/lecture-live-transcribe/`
4. 第一次開啟：允許麥克風；選本機雙語模式時等模型下載完

## 瀏覽器支援

| 功能 | Chrome 138+ | Edge | Safari | Firefox |
|---|---|---|---|---|
| 快速模式辨識 | ✅ | ✅ | 部分 | ❌ |
| 本機雙語辨識（Whisper） | ✅ WebGPU | ✅ WebGPU | WASM | WASM |
| 選配對照翻譯 | ✅ | 視版本 | ❌ | ❌ |
