# 架構說明 v3

> 對應 `PROMPT.md` v3，已實作。目錄結構見 README。

## 一句話
Next.js static export 的純前端應用，辨識、翻譯全在瀏覽器內完成，零後端、零金鑰、零費用，部署在 GitHub Pages。

## 資料流

```
麥克風（單聲道）
  │
  ├─ 快速模式 ─► SpeechRecognition（zh-TW / en-US）
  │                interim → 淡字預覽；final → 段落
  │                onend → 若仍 listening 立即重啟
  │
  └─ 本機雙語 ─► Web Audio 取樣 → 連續區塊（含 overlap）
                   → Web Worker 內的 multilingual Whisper（WebGPU，退 WASM）
                   → overlap 去重 → 段落
  │
  ▼
校正規則（使用者自建、預設關閉、只套 final、標示可還原）
  │
  ▼
TranscriptSegment { text, rawText, timestamp, detectedLanguage }
  │
  ├─► IndexedDB（每次定稿即寫入）
  ├─► 渲染：置中閱讀欄、interim 固定在底、智慧自動捲動
  └─► 選配對照翻譯（Chrome Translator + LanguageDetector，預設關閉）
        → segment.translation，顯示為次要行，原文不動
```

## 分層

| 層 | 檔案 | 職責 |
|---|---|---|
| 狀態機 | `lib/session-machine.ts` | idle → checking-capability → requesting-permission → downloading-model → ready → listening ⇄ paused → recovering / error → ended；RESET 供重試與換引擎 |
| 控制中樞 | `features/live/useLiveSession.ts` | 串起狀態機、麥克風、引擎、規則、翻譯、儲存與時鐘；UI 只讀狀態、叫動作 |
| 轉錄引擎 | `providers/transcription/` | `TranscriptionProvider` 介面；`WebSpeechProvider`（自動重啟、resultIndex 去重、phrase biasing）、`WhisperProvider` + `whisper.worker.ts`（區塊、overlap、靜音跳過）、`whisper-hints.ts`（語言 token 與詞彙前文提示）。Worker 自己組 `decoder_input_ids` 是因為 Transformers.js 3.x 沒實作 `prompt_ids`；中文輸出經 OpenCC 簡轉繁 |
| 翻譯 | `providers/translation/chrome.ts` | Chrome Translator + LanguageDetector；不支援回 null |
| 音訊 | `lib/audio/mic.ts` + `public/pcm-worklet.js` | getUserMedia、音量計、16 kHz PCM（AudioWorklet，退 ScriptProcessor）、資源釋放 |
| 逐字稿處理 | `lib/transcript/` | `segmentation`（合併段落）、`dedupe`（overlap 去重、幻覺過濾）、`corrections`（規則套用、從編輯推規則） |
| 儲存 | `lib/db.ts`、`lib/prefs.ts` | IndexedDB repository；localStorage 偏好 |
| 匯出 | `lib/export.ts` | TXT／Markdown，選附筆記、譯文、摘要提示詞 |
| 錯誤 | `lib/errors.ts` | 三段式訊息與可執行動作 |
| 能力偵測 | `lib/capability.ts` | SpeechRecognition、phrase biasing、WebGPU、WASM、Translator、安全來源 |
| UI | `components/`、`features/*`、`styles/tokens.css` | design tokens、四個畫面 |

## 為什麼這樣選

| 決策 | 選擇 | 取捨 |
|---|---|---|
| 雙引擎 | Web Speech 當 30 秒起手式，Whisper 當中英混合的推薦引擎 | Web Speech 免費零設定但音訊上雲、混合語言弱；Whisper 音訊不出裝置、混合語言強，但要下載模型、吃算力、有數秒延遲，教室電腦不一定跑得動 |
| 框架 | Next.js static export | 需要 worker 打包、TypeScript、測試與元件結構；static export 讓 GitHub Pages 免費託管 |
| 翻譯 | 選配、預設關閉、只用 Chrome 內建 | 保住「不自動翻譯」原則，又保留原始需求的中英對照 |
| 校正規則 | 使用者自建、可見可還原 | 這是免費路線下中英夾雜唯一的補救，透明化後不違反「不偷改逐字稿」 |
| 儲存 | IndexedDB | 逐字稿、筆記、規則多表；比 localStorage 容量大、可結構化查詢 |

## 已知風險
1. Chrome 辨識靜音或約一分鐘後自動停止，重啟瞬間會掉字，只能縮短間隔減輕。
2. 分頁切背景時 Chrome 可能節流或停麥克風，需 visibilitychange 警告。
3. Whisper 在無 WebGPU 的教室電腦上退到 WASM 會很慢，UI 必須誠實顯示延遲。
4. Translator API 需 Chrome 138+，版本舊就沒有對照翻譯。
5. 英文術語在快速模式常被拼成中文諧音，靠校正規則慢慢養。
