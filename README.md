# CaseNote

**專心聽課，讓逐字稿跟上你。**

商學院學生的免費中英混合課堂即時轉錄工作台。上課時在 Chrome 開著，教授講的話即時變成逐字稿，旁邊記自己的筆記，下課匯出。
不需要帳號、不需要 API Key、不產生任何費用，所有資料只存在你的裝置。

## 它做什麼

- **三種轉錄引擎**：快速模式（瀏覽器內建語音辨識，30 秒內開始）、本機雙語辨識（瀏覽器內執行的 multilingual Whisper，音訊不離開裝置）、自備金鑰（Groq 的 whisper-large-v3-turbo，品質最高，需自己免費申請 key，音訊會送到 Groq）。
- **中英混合**：同一段落保留原本的中文與英文，不自動翻譯、不強迫單一語言。
- **課堂工作台**：即時逐字稿、interim 預覽、智慧自動捲動、搜尋、編輯、標記、複製、時間戳記。
- **個人筆記**：與逐字稿分開的側欄，可加標籤、引用段落，按 `N` 直接輸入。
- **課程詞彙表**與**校正規則**：詞彙當辨識提示（快速模式走 Chrome phrase biasing，本機模式當 Whisper 的前文提示）；校正規則由你自己建立、預設關閉、替換處可見可還原。
- **語言提示**：建課堂時選的語言模式同時餵給兩個引擎；本機模式的中文輸出會自動由簡體轉成繁體（OpenCC，本機執行）。
- **選配對照翻譯**：Chrome 138+ 內建 Translator API，本機執行，預設關閉，原文永遠不動。
- **匯出**：Markdown／TXT，可選附筆記、譯文與「摘要提示詞」（貼到任何 AI 網頁請它整理重點，CaseNote 本身不做摘要）。
- **錯誤恢復**：辨識意外停止自動重連；任何錯誤都不會刪除已完成的逐字稿。

## 自備金鑰引擎（Groq）

沒有 WebGPU 的電腦跑不動本機大模型、快速模式又不夠準時的選項。

1. 到 https://console.groq.com/keys 免費申請一組 API key。
2. 建課堂時選「自備金鑰（Groq）」，把 key 貼進去，按「測試金鑰」。
3. key 只存在這台瀏覽器的 localStorage，不進 IndexedDB、不進匯出檔；每句話會以 WAV 直接從瀏覽器送到 Groq，中間沒有任何伺服器。

運作方式：能量式 VAD 在講者停頓處切段（最長 20 秒），送出去的每一段都是完整句子；帶語言與詞彙提示；中文輸出轉繁體；429 與 5xx 自動退避重試，連續失敗才停下來並告知。

## 本機啟動

```bash
npm install
npm run dev        # http://localhost:3000
```

檢查與建置：

```bash
npm run typecheck
npm run lint
npm test
npm run build      # 靜態輸出到 out/
```

麥克風與內建 AI 都要求安全來源，`localhost` 可以，`file://` 不行。

## 部署到 GitHub Pages（免費）

1. Repo → **Settings → Pages → Source** 選 **GitHub Actions**。
2. 推上 `main`，`.github/workflows/pages.yml` 會跑 typecheck、lint、test、build，再發布 `out/`。
3. 網址是 `https://<帳號>.github.io/lecture-live-transcribe/`。

建置時 `NEXT_PUBLIC_BASE_PATH` 會自動設成 `/<repo 名>`；本機開發不用設。

## 第一次使用

1. 首頁按「開始新課堂」，填課程名稱、選語言模式。
2. 「辨識方式」會依裝置推薦：有 WebGPU 且選中英混合時推薦本機雙語辨識，否則推薦快速模式。
3. 先「測試麥克風」，確認音量條有反應。
4. 按「開始轉錄」。本機模式第一次會下載模型（一次性，之後留在瀏覽器快取），可以隨時改用快速模式。

快捷鍵：`Space` 暫停／繼續、`N` 新增筆記、`Cmd/Ctrl+F` 搜尋、`Cmd/Ctrl+S` 立即保存、`Esc` 關閉浮層。打字時不會被攔截。

## 隱私

- 逐字稿、筆記、詞彙、規則存在瀏覽器的 IndexedDB；介面偏好存 localStorage。
- 不保存原始錄音，沒有後端，程式碼裡沒有任何金鑰。
- **快速模式**使用瀏覽器提供的辨識服務，音訊會送到瀏覽器供應商的伺服器（Chrome 是 Google）處理，介面會明確提示。
- **本機雙語模式**的音訊不離開裝置。
- 開始前請確認已取得授課者與參與者同意。

## 瀏覽器支援

| 功能 | Chrome / Edge | Safari | Firefox |
|---|---|---|---|
| 快速模式 | ✅ | 部分（會自動停止較頻繁） | ❌ |
| 本機雙語辨識 | ✅ WebGPU；無 WebGPU 退 WASM | WASM（慢） | WASM（慢） |
| 自備金鑰（Groq） | ✅ | ✅ | ✅ |
| 對照翻譯 | Chrome 138+ | ❌ | ❌ |
| 詞彙提示（phrase biasing） | 新版 Chrome | ❌ | ❌ |

## 技術架構

Next.js 15（static export）、TypeScript、Tailwind CSS、IndexedDB（idb）、Web Audio、Web Speech API、Transformers.js（Whisper）、Vitest。
分層與資料流見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，完整需求見 [`PROMPT.md`](PROMPT.md)。

```
src/
├── app/                 四個路由：/、/new、/live、/review
├── components/          Button、Dialog、Icon、StatusPill、MicLevel、PrefsProvider…
├── features/
│   ├── home/            課程紀錄
│   ├── new/             建立課堂、麥克風測試
│   ├── live/            即時工作台：useLiveSession 控制中樞 + 各元件
│   └── review/          課後逐字稿、匯出、刪除
├── lib/
│   ├── session-machine  狀態機（idle → … → ended）
│   ├── db               IndexedDB repository
│   ├── transcript/      分段合併、overlap 去重、校正規則
│   ├── audio/           麥克風、音量計、16 kHz PCM
│   ├── export、errors、capability、keyboard、prefs
├── providers/
│   ├── transcription/   TranscriptionProvider 介面、Web Speech、Whisper（worker）
│   └── translation/     Chrome Translator API
└── styles/              design tokens（CSS variables）與全域樣式
```

## 已知限制

- **快速模式的中英夾雜**：Chrome 的中文模型會把英文術語拼成中文諧音（例如「安批威」），這是瀏覽器辨識的天花板。校正規則是免費路線下唯一的補救，需要幾堂課慢慢養。
- **Chrome 會自己停止辨識**：靜音或約一分鐘後觸發 `onend`，CaseNote 會立刻重啟，但重啟瞬間的一兩個字可能掉。
- **本機雙語辨識的延遲**：每 7 秒送一塊音訊，WebGPU 裝置延遲約數秒；沒有 WebGPU 的教室電腦會慢到十幾秒，介面會誠實顯示「本機辨識中」。跟不上時會略過音訊並提示。
- **模型大小**：WebGPU 用 whisper-small、WASM 用 whisper-base，實際大小以下載時顯示的為準；第一次下載需要網路。
- **分頁在背景**：Chrome 可能節流或暫停麥克風，介面會警告；上課中請讓 CaseNote 留在前景。
- **語言提示是提示不是限制**：中英混合模式下 Whisper 以中文為主要語言，聽到英文術語通常仍會寫成英文，但偶爾會把整句英文翻成中文；遇到時切成 English-first 或改用快速模式。
- **尚未在真實課堂驗證的部分**：本機 Whisper 路徑（含前文提示與簡轉繁）、Chrome Translator API 與 phrase biasing 在開發環境沒有 WebGPU 與 Chrome 138 可測，目前以程式碼審閱與單元測試為準，快速模式的完整流程則用模擬的 SpeechRecognition 跑過端對端。
- **自備金鑰引擎**：Groq 免費額度有速率限制，超過時會退避重試、延遲拉長；金鑰洩漏的風險由使用者自己承擔。
- **不做的事**：帳號、雲端同步、講者辨識、應用內 AI 摘要、自動翻譯。
