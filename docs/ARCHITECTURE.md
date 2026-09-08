# 架構說明（待確認）

## 一句話
**純靜態網頁**，辨識、翻譯、摘要全部用 Chrome 內建能力，零後端、零金鑰、零費用。

## 資料流

```
麥克風
  │
  ▼
SpeechRecognition（zh-TW 或 en-US，continuous + interimResults）
  │  interim → 灰字即時預覽
  │  final   → 定稿
  ▼
術語校正表（glossary.js）：「聽錯 → 正確」逐條替換
  │
  ▼
分段器（recognizer.js）：停頓 ≥ 2.5s 或句尾標點 → 一個 Segment { t, src, lang }
  │
  ├──► LanguageDetector → 決定翻譯方向（zh→en 或 en→zh）
  │         │
  │         ▼
  │    Translator API（本機模型）→ Segment.en / Segment.zh
  │
  ├──► 渲染（app.js）：依模式顯示 原文／中文／英文／對照
  │
  └──► localStorage（storage.js）：每次定稿即寫入，key = llt:session:<id>

結束後
  └──► Summarizer API 可用 → 摘要
       不可用            → 複製「逐字稿 + 摘要提示詞」貼到免費 AI 網頁
```

## 為什麼這樣選

| 決策 | 選擇 | 取捨 |
|---|---|---|
| 語音辨識 | Web Speech API | 免費、零設定；代價是只有 Chrome／Edge 好用、音訊會送到 Google 伺服器、無法自訂詞彙。中英夾雜靠 zh-TW 模型本身加術語校正表補救。 |
| 翻譯 | Chrome Translator API | 本機跑、免費、快；代價是需要 Chrome 138+ 且第一次要下載語言包（每個方向約數十 MB）。不支援時退化成只有原文模式。 |
| 摘要 | Chrome Summarizer API，退路是複製提示詞 | Summarizer 對硬體有要求（需下載 Gemini Nano），教室電腦不一定跑得動，所以退路是主要路徑。 |
| 儲存 | localStorage | 一堂三小時課的逐字稿約 100 KB，遠低於 5 MB 上限；不需要 IndexedDB 的複雜度。 |
| 部署 | GitHub Pages | 免費、自帶 HTTPS。麥克風與內建 AI 都要求安全來源，所以不能直接雙擊 index.html 開。 |
| 不用 PWA | 第一版不做 | 使用者只在教室電腦的瀏覽器開，離線快取沒有價值。 |

## 已知風險
1. **Chrome 辨識自動停止**：靜音或約一分鐘後 `onend` 會觸發，要立刻重啟；重啟瞬間的字會掉，只能靠縮短間隔減輕。
2. **分頁切到背景**：Chrome 可能節流或停麥克風，UI 要在 `visibilitychange` 時顯示警告。
3. **中英夾雜的英文術語會被拼成中文諧音**：這是 Web Speech 的天花板，術語校正表是唯一免費解法，要讓使用者一鍵把「聽錯的字」加進表。
4. **Translator API 可用性**：Windows／macOS 的 Chrome 138+ 才有；教室電腦版本太舊就只剩原文模式。

## 目錄結構

```
lecture-live-transcribe/
├── index.html            主畫面：轉錄區、模式切換、術語表側欄、設定
├── style.css             桌面優先版面、深色模式、三段字級
├── app.js                狀態機（閒置／錄音中／暫停）與 UI 事件綁定
├── recognizer.js         包 SpeechRecognition：自動重啟、interim/final、分段、時間戳
├── glossary.js           術語校正表：內建財金表、使用者增刪、套用替換
├── translator.js         包 Translator + LanguageDetector：能力偵測、模型下載進度、逐段翻譯快取
├── summarizer.js         包 Summarizer：可用就用，否則產生「逐字稿 + 提示詞」字串
├── storage.js            localStorage 讀寫、場次列表、資料版本號
├── exporter.js           Markdown／TXT 匯出與剪貼簿
├── PROMPT.md             需求（本專案的完整 prompt）
├── docs/ARCHITECTURE.md  本檔
└── README.md             部署與使用說明
```

## 資料結構

```js
// llt:session:<id>
{
  v: 1,
  id: "2026-09-08T10:00:00",
  title: "財務管理 W3",
  lang: "zh-TW",              // 辨識語言
  segments: [
    { t: 12.4,                 // 距開始秒數
      src: "我們今天講 NPV 跟 IRR 的差別",
      lang: "zh",              // LanguageDetector 結果
      en: "Today we'll cover the difference between NPV and IRR" }
  ]
}
// llt:glossary → [ ["安批威", "NPV"], ["一比達", "EBITDA"], … ]
// llt:settings → { mode: "both", fontSize: 2, dark: true }
```
