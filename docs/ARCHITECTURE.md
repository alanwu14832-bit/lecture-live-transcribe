# 架構說明 v3

> 對應 `PROMPT.md` v3。v2 的純靜態 HTML 路線已被取代。

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

| 層 | 職責 |
|---|---|
| `features/session` | 狀態機：idle → checking-capability → requesting-permission → downloading-model → ready → listening ⇄ paused → recovering / error → ended |
| `providers/transcription` | `TranscriptionProvider` 介面；`WebSpeechProvider`、`WhisperWorkerProvider` |
| `providers/translation` | `TranslationProvider` 介面；`ChromeTranslatorProvider`，能力偵測失敗就回 null |
| `audio` | getUserMedia、AudioContext、重取樣、音量計、資源釋放 |
| `transcript` | 分段、相鄰 final 合併、overlap 去重、校正規則套用與還原 |
| `storage` | IndexedDB repository（sessions、segments、notes、glossary、rules）；localStorage 存偏好 |
| `export` | TXT／Markdown，含或不含譯文與摘要提示詞 |
| `errors` | 技術錯誤 → 「發生什麼、會不會掉資料、接下來怎麼做」三段式訊息 |
| `capability` | SpeechRecognition、WebGPU、WASM、Translator、IndexedDB 偵測 |
| `ui` | design tokens、元件、四個畫面 |

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
