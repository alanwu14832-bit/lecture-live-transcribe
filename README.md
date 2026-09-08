# lecture-live-transcribe

個人用的課堂即時轉錄網頁：在教室電腦的 Chrome 打開，即時把教授講的話轉成文字，
可切換顯示原文／繁體中文／英文／中英對照。**全程免費，不需要 API 金鑰，沒有後端。**

- 辨識：Chrome 內建 Web Speech API
- 翻譯：Chrome 內建 Translator API（本機模型，Chrome 138+）
- 摘要：Chrome 內建 Summarizer API，不支援時一鍵複製逐字稿與提示詞到任何 AI 網頁
- 儲存：只存在瀏覽器 localStorage

目前狀態：需求與架構已定案，程式尚未開始。

- 需求：[`PROMPT.md`](PROMPT.md)
- 架構與目錄結構：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 部署（GitHub Pages）

1. Repo → Settings → Pages → Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`
2. 等一分鐘，網址是 `https://<帳號>.github.io/lecture-live-transcribe/`
3. 第一次開啟：允許麥克風；切到翻譯模式時等語言包下載完

## 瀏覽器支援

| 功能 | Chrome 138+ | Edge | Safari | Firefox |
|---|---|---|---|---|
| 即時辨識 | ✅ | ✅ | 部分 | ❌ |
| 本機翻譯 | ✅ | 視版本 | ❌ | ❌ |
