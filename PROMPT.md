# CaseNote 開發 Prompt v3（整合版）

> 由兩份 prompt 合併：v2 的「免費、個人用、教室電腦收音、中英夾雜」需求，加上完整產品規格版的雙引擎架構、設計系統與驗收標準。衝突處已定案，見文末附錄。

你是一位收費 300,000 美元、世界頂級的產品設計師、UX 研究員、設計系統專家與資深全端工程師。

請設計並實作一個面向商學院學生的「免費中英混合課程即時轉錄網站」產品級 MVP。

- 產品名稱：CaseNote
- 介面語言：繁體中文
- 主要平台：桌面版瀏覽器（教室電腦的 Chrome）
- 次要平台：手機瀏覽器

這不是 landing page，也不是華麗但不能用的設計稿。它是一個學生會在 60–180 分鐘課堂中持續開啟、必須能放心依賴的學習工作台。請完成真正可執行的產品，不要只提供規格、wireframe、mockup 或虛擬碼。

━━━━━━━━━━━━━━━━━━
一、產品願景
━━━━━━━━━━━━━━━━━━

核心價值主張：「專心聽課，讓逐字稿跟上你。」

主要使用者與場景：

- 第一版只有一位使用者：台灣商學院學生，自己上課用
- 教室電腦（Windows 或 macOS）的 Chrome，用電腦內建或外接麥克風收音
- 距離講者 3–15 公尺，有空調與同學交談的背景噪音
- 一堂課 50–180 分鐘
- 商學院中文授課、英文授課，以及同一句話中出現中文與英文
- 教授大量使用英文商業術語：個案討論、金融、會計、策略、行銷與經濟學
- 學生一邊聽課、一邊看逐字稿並記個人筆記

真實內容像：

- 「這間公司的 operating margin 比 industry average 高。」
- 「接下來用 discounted cash flow 計算 enterprise value。」
- 「如果 terminal growth rate 設太高，DCF valuation 會失真。」
- 「教授剛才提到 network effect 和規模經濟。」

系統必須保留說話者原本使用的語言，逐字稿本身不自動翻譯，也不強迫整段只能用單一語言。

━━━━━━━━━━━━━━━━━━
二、設計原則
━━━━━━━━━━━━━━━━━━

學生上課時，90% 的注意力應該留給老師，而不是介面。

產品必須：

- 30 秒內開始第一次轉錄
- 一眼看懂目前是否正在收音
- 不需要頻繁操作
- interim 文字不持續跳動干擾閱讀
- 發生錯誤時不遺失已完成內容
- 清楚說明資料保存與音訊處理方式
- 適合連續閱讀數小時，字級可調三段
- 分頁切到背景時醒目警告（Chrome 可能節流或暫停麥克風）
- 對技術限制誠實，不使用假的 AI 能力、信心分數或分析結果

不要加入：

- 帳號、註冊、訂閱、價格方案
- 付費語音 API
- 應用內 AI 摘要（匯出時附一段「摘要提示詞」讓使用者貼去別的 AI 網頁，不算）
- 未經使用者主動開啟的翻譯
- 講者辨識、雲端同步
- 假評論、客戶 Logo、誇張數據
- 尚未實作卻看似可用的按鈕

━━━━━━━━━━━━━━━━━━
三、免費與隱私限制
━━━━━━━━━━━━━━━━━━

必須遵守：

- 不使用任何付費 API、不需要 API Key、不建立付費後端
- 不上傳或保存原始錄音
- 課程、逐字稿、筆記、詞彙表預設只儲存在本機：主要資料用 IndexedDB，介面偏好用 localStorage
- 程式碼中不得包含秘密金鑰
- 本機辨識模式的音訊不得離開使用者裝置
- 快速模式使用瀏覽器提供的辨識服務時，必須誠實提示「音訊會送到瀏覽器供應商的伺服器處理（Chrome 是 Google）」，不可宣稱離線
- 部署到免費靜態託管（GitHub Pages），沒有伺服器端執行

網站應顯示：

「轉錄內容只儲存在這台裝置。我們不保存原始錄音。開始前請確認已取得授課者與參與者同意。」

━━━━━━━━━━━━━━━━━━
四、免費雙引擎轉錄架構
━━━━━━━━━━━━━━━━━━

建立統一的 TranscriptionProvider abstraction，UI、資料儲存與課堂狀態不得依賴特定引擎。

**A. 本機雙語模式**（中英混合的推薦模式，裝置夠力時才推薦）

使用瀏覽器內運行的 multilingual Whisper：

- Transformers.js、Whisper WebGPU／WASM 或同等免費方案，使用目前穩定、可維護的實作
- 必須用 multilingual 模型，不可用名稱帶 .en 的英語專用模型
- task 用 transcription 不是 translation；不強制單一輸出語言；保留原始中英文
- 優先量化的小型 multilingual 模型；優先 WebGPU，不可用時降級 WASM
- 推論放在 Web Worker，不得阻塞 main thread
- 模型下載後快取在瀏覽器；首次下載顯示真實進度與實際大小，不寫死可能不正確的大小
- 麥克風取單聲道音訊，轉成模型需要的取樣率與格式
- 連續音訊區塊近即時辨識，相鄰區塊保留少量 overlap，實作 overlap 去重
- final segment 不可反覆改寫或重複加入
- 停止後釋放 microphone track、AudioContext、Worker 與其他資源

UI 稱它「本機雙語辨識」，誠實呈現延遲與處理狀態，不包裝成零延遲即時辨識。

**B. 快速模式**（30 秒內能開始的路徑）

使用 window.SpeechRecognition 或 window.webkitSpeechRecognition：

- continuous = true、interimResults = true、maxAlternatives = 1
- 語言：中文為主用 zh-TW；English-first 用 en-US；中英混合讓使用者指定主要語言作為底層 lang，不要求課堂中頻繁切換，但保留容易操作的快速切換
- 不同時啟動兩個 SpeechRecognition instance
- 若瀏覽器支援 contextual phrase biasing，把課程詞彙表當提示；不支援就正常降級

Chrome 會在靜音或約一分鐘後自動觸發 onend，這是常態不是例外：

- session 仍為 listening 就安全重啟，重啟間隔盡量短以減少掉字
- 已 paused 或 ended 不可重啟
- 防止重複 start 造成 InvalidStateError；不重複建立 instance；不重複加入 final transcript
- 多次失敗後顯示持續存在的錯誤列與「重新連線」

━━━━━━━━━━━━━━━━━━
五、語言模式與首次使用
━━━━━━━━━━━━━━━━━━

三種使用者看得懂的選項：

1. 中英混合（推薦）
2. 中文為主
3. English-first

主要流程不展示 WebGPU、WASM、模型 ID 等技術名詞。

選「中英混合」時：裝置適合本機模型就推薦本機雙語辨識；不可用就提供快速模式，並說明快速模式對同一句內的中英切換可能較不準。

第一次使用本機模式顯示：

- 標題：「下載免費雙語辨識模型」
- 說明：只需下載一次／音訊留在這台裝置／不需要帳號或 API Key／會用較多運算能力與電力
- 主要按鈕「下載並開始」，次要按鈕「先使用快速模式」
- 下載狀態：百分比、已下載／總大小、取消、失敗原因、重試、完成
- 模型已快取就不再顯示下載流程

━━━━━━━━━━━━━━━━━━
六、選配對照翻譯
━━━━━━━━━━━━━━━━━━

這是使用者主動開啟的顯示層，不是逐字稿的一部分：

- 只用 Chrome 內建 Translator API 與 LanguageDetector API（本機模型、免費）；瀏覽器不支援就隱藏開關並說明原因
- 預設關閉；開啟後在每段正式逐字稿下方以次要樣式顯示譯文（中翻英或英翻中，由偵測結果決定）
- 原始逐字稿永遠不被改動、不被取代
- 譯文逐段快取；語言包下載顯示進度
- 匯出時可選擇是否附上譯文
- 不對 interim 文字翻譯

━━━━━━━━━━━━━━━━━━
七、資訊架構
━━━━━━━━━━━━━━━━━━

只有四個主要畫面，不建立多層導覽：

1. 首頁／課程紀錄
2. 建立課堂
3. 即時課堂工作台
4. 課後逐字稿

首頁包含：品牌名稱、價值主張一句話、「開始新課堂」主要按鈕、最近課堂（名稱、日期、時長、語言、文字量）、「只儲存在這台裝置」提示、高品質空狀態。匯入或還原留待後續，不做假按鈕。首頁不是行銷頁。

━━━━━━━━━━━━━━━━━━
八、建立課堂流程
━━━━━━━━━━━━━━━━━━

只問必要資訊：課程名稱、語言模式、是否開啟個人筆記側欄、選填課程詞彙。

麥克風測試：是否正常、簡潔的即時音量、目前輸入裝置、隱私說明、成功時低調提示、權限被拒時可執行的處理步驟。

主要 CTA 用「開始轉錄」，不用模糊的「下一步」。

━━━━━━━━━━━━━━━━━━
九、即時課堂工作台
━━━━━━━━━━━━━━━━━━

桌面版結構：頂部狀態列、中央逐字稿閱讀區、可收合個人筆記側欄、底部固定控制列。

頂部狀態列：

- 左：返回、可編輯課程名稱
- 中：正在聆聽／已暫停／正在處理／正在恢復／發生問題／已結束，加經過時間
- 右：語言模式、搜尋、個人筆記開關、對照翻譯開關（支援時才顯示）、更多選單

狀態同時用文字、圖示、顏色表示，不可只靠紅點。

━━━━━━━━━━━━━━━━━━
十、逐字稿體驗
━━━━━━━━━━━━━━━━━━

逐字稿是視覺主角：閱讀欄置中、最大寬度 760–860px、桌面正文 18px 起可三段調整、行高 1.7、不用聊天泡泡、不把每句包成卡片、不因一個英文詞彙另起段落。

每個正式段落：低對比時間戳記、final transcript、hover 或 focus 顯示編輯／複製／標記。相鄰 final results 合併成易讀段落。

Interim transcript：固定在最新內容下方、較淡文字、不推動整頁布局、成為 final 後平順加入、不用打字動畫。

自動捲動：在底部時跟隨最新；向上閱讀立刻停止強制捲動並顯示「回到最新內容」；點擊後才恢復。

支援：直接編輯、搜尋與醒目標示、標記重要段落、複製單段、複製全文、匯出 TXT／Markdown、自動本機保存、顯示「已儲存在此裝置」。

━━━━━━━━━━━━━━━━━━
十一、中英文排版
━━━━━━━━━━━━━━━━━━

- 適合繁體中文與拉丁字母的字體組合
- 保留英文縮寫大小寫：EBITDA、WACC、DCF、NPV 不可被改成首字大寫
- 金額、百分比、公式容易辨識
- 英文搜尋不分大小寫
- 匯出保留原始中英文、標點、段落與時間戳記

版面測試句：「教授剛才提到，這家公司的 revenue growth 雖然很高，但 operating margin 還沒有改善。如果要做 DCF valuation，我們需要重新檢查 WACC 和 terminal growth rate 的假設。」

━━━━━━━━━━━━━━━━━━
十二、個人筆記
━━━━━━━━━━━━━━━━━━

可收合的「我的筆記」側欄，與自動逐字稿清楚分離：快速輸入、自動記錄時間、標籤（考試重點、不懂、個案、待複習）、引用某段逐字稿、編輯與刪除、本機自動保存、側欄關閉後資料仍在。不把個人筆記混入正式逐字稿。

━━━━━━━━━━━━━━━━━━
十三、課程詞彙表與校正規則
━━━━━━━━━━━━━━━━━━

**詞彙表**預設包含：EBITDA、WACC、DCF、NPV、IRR、discounted cash flow、net present value、enterprise value、operating margin、customer acquisition cost、lifetime value、network effect、market segmentation、Porter's Five Forces、資產負債表、現金流量表、邊際成本、機會成本、公司治理、規模經濟。

規則：可新增刪除；引擎支援 contextual biasing 時當提示，不支援就降級；使用者修正逐字稿後可一鍵加入詞彙表；只存本機。

**校正規則**是免費路線下處理中英夾雜的唯一補救，但必須透明：

- 使用者自己建立「聽錯 → 正確」的明確對應，例如「安批威 → NPV」、「一比達 → EBITDA」
- 預設關閉；內建一份建議清單但不自動啟用
- 只套用在 final 文字，不碰 interim
- 被替換的字用點狀底線標示，hover 顯示原始辨識結果，可一鍵還原
- 使用者編輯某段後，可一鍵把這次修正變成規則
- 系統不可在沒有明確規則時偷偷修改逐字稿

━━━━━━━━━━━━━━━━━━
十四、底部控制列
━━━━━━━━━━━━━━━━━━

固定底部中央的 dock：暫停／繼續、結束課堂、麥克風音量、經過時間、語言模式、本機保存狀態、本機模型處理狀態。

資訊優先順序：是否正在轉錄 → 暫停／繼續 → 是否安全保存 → 是否仍在處理音訊 → 結束課堂。

「結束課堂」與「刪除紀錄」是不同動作；結束不刪內容。

━━━━━━━━━━━━━━━━━━
十五、錯誤恢復
━━━━━━━━━━━━━━━━━━

必須完整處理：瀏覽器不支援 SpeechRecognition、WebGPU 不可用、WASM 或模型載入失敗、模型下載中斷、拒絕麥克風權限、找不到麥克風、長時間沒有聲音、網路中斷、平台辨識服務中斷、SpeechRecognition 意外停止、InvalidStateError、Worker 崩潰、IndexedDB 儲存失敗、記憶體或效能不足、分頁切到背景、使用者重新整理或關閉頁面。

錯誤不能只顯示短暫 toast。錯誤訊息必須回答：發生什麼事、是否會失去資料、接下來可以做什麼。

範例：「轉錄暫時中斷。已完成的文字仍安全保存在這台裝置。正在嘗試重新連線⋯」

錯誤發生時，不得刪除已確認的逐字稿。

━━━━━━━━━━━━━━━━━━
十六、視覺設計系統
━━━━━━━━━━━━━━━━━━

氣質：現代編輯工具的精準感、高品質學術出版物的閱讀感、商學院產品的理性與專業、安靜克制、像真正成熟的產品而不是 AI 網站模板。

禁止：大面積漸層、紫色 AI 風格、玻璃擬態、發光按鈕、3D 裝飾、過多陰影、過多圓角卡片、巨大 hero、無功能動畫、emoji 主要圖示、每個按鈕都做膠囊形。

色彩（以 CSS variables 建立語意化 tokens，不在元件中散落 hex）：

- Light：Canvas #F7F7F4、Surface #FFFFFF、Primary text #182033、Secondary text #667085、Border #E4E7EC、Brand #3157D5、Recording #C94747、Success #2F7D5A、Warning #A56618
- Dark：Canvas #111318、Surface #191C23、Primary text #F2F4F7、Secondary text #98A2B3、Border #2B303B、Brand #7997FF

字體：Inter、Noto Sans TC、系統 sans-serif fallback；時間與狀態數字用 tabular numbers。

圓角：控制元件 8–10px、主要容器 12–14px；陰影只用於浮層。

圖示用一致的開源圖示庫，必須有 accessible label。

━━━━━━━━━━━━━━━━━━
十七、動態與回饋
━━━━━━━━━━━━━━━━━━

動畫只用來解釋狀態：一般 transition 150–220ms；interim 轉 final 低調淡入；收音中輕微呼吸效果；保存、恢復、錯誤轉換清楚；支援 prefers-reduced-motion；不用霓虹、跳動或大幅縮放。

━━━━━━━━━━━━━━━━━━
十八、響應式設計
━━━━━━━━━━━━━━━━━━

桌面：逐字稿保持最佳閱讀寬度、筆記為右側可收合欄、控制列固定可見。

手機：筆記改 bottom sheet、頂部只留核心狀態、主要操作至少 44×44px、單手可操作、鍵盤不遮輸入區、控制列尊重 safe area、不是把桌面版縮小。

━━━━━━━━━━━━━━━━━━
十九、無障礙與快捷鍵
━━━━━━━━━━━━━━━━━━

至少 WCAG AA：清楚 focus state、不只靠顏色、正確語意 HTML、圖示按鈕有 accessible label、aria-live 不朗讀每個 interim 字詞、支援 reduced motion、對比達標、字級可調。

快捷鍵：Space 暫停／繼續、N 新增筆記、Cmd/Ctrl+F 搜尋、Cmd/Ctrl+S 立即保存、Esc 關閉浮層。使用者正在輸入時不可攔截 Space 或其他輸入按鍵。

━━━━━━━━━━━━━━━━━━
二十、技術架構
━━━━━━━━━━━━━━━━━━

使用：Next.js（static export，`output: 'export'`，設定 basePath 以部署到 GitHub Pages）、TypeScript、Tailwind CSS、可重用 React components、IndexedDB、Web Workers、Web Audio API、Web Speech API、免費 browser-compatible multilingual Whisper、Chrome Translator／LanguageDetector API（選配）。

不使用需要伺服器執行的 Next.js 功能（API routes、server actions、動態 SSR）。

分層：UI components、session state machine、transcription providers、translation provider（選配）、audio processing、transcript segmentation、overlap deduplication、correction rules、local storage repository、export utilities、error mapping、feature detection。

Session 狀態至少：idle、checking-capability、requesting-permission、downloading-model、ready、listening、processing、paused、recovering、error、ended。不以多個互相衝突的 boolean 取代狀態機。

資料模型至少：

- Session：id、title、languageMode、transcriptionEngine、translationEnabled、createdAt、updatedAt、startedAt、endedAt、duration、status
- TranscriptSegment：id、sessionId、text、rawText（套用校正規則前的原始辨識結果，未套用時為空）、timestamp、detectedLanguage、translation（選填：lang、text）、isBookmarked、createdAt、updatedAt
- PersonalNote：id、sessionId、text、tag、referencedSegmentId、createdAt、updatedAt
- GlossaryTerm：id、term、sessionId、createdAt
- CorrectionRule：id、from、to、enabled、createdAt

不儲存原始音訊。

部署：GitHub Actions 建置 static export 並發布到 GitHub Pages；README 說明步驟。

━━━━━━━━━━━━━━━━━━
二十一、測試與品質
━━━━━━━━━━━━━━━━━━

至少測試：session state transitions、SpeechRecognition 意外 onend 後的恢復、pause 後不自行重啟、final transcript 去重、Whisper chunk overlap 去重、校正規則只改 final 且可還原、翻譯不支援時的降級、IndexedDB 儲存與還原、重新整理後資料仍在、匯出 TXT／Markdown、不支援瀏覽器的 fallback、麥克風權限被拒、快捷鍵不干擾文字輸入。

完成後執行 TypeScript typecheck、lint、unit tests、production build，修正所有合理可修的錯誤與警告。

━━━━━━━━━━━━━━━━━━
二十二、執行方式
━━━━━━━━━━━━━━━━━━

先檢視 repository。目前只有 README、PROMPT.md 與 docs/ARCHITECTURE.md，沒有程式碼，請建立可執行專案、合理目錄結構、必要依賴與完整 MVP。

工作順序：

1. 簡短列出實作策略
2. 說明資訊架構與關鍵流程
3. 列出主要檔案
4. 建立 design tokens
5. 建立資料模型與狀態機
6. 實作本機保存
7. 實作快速辨識模式
8. 實作本機雙語模式
9. 實作選配對照翻譯與校正規則
10. 完成產品級 UI
11. 完成響應式與無障礙
12. 加入具代表性的 demo session
13. 執行測試、lint、typecheck 與 build，修正問題
14. 提供本機啟動、GitHub Pages 部署與使用說明
15. 誠實列出已知限制

程式碼註解與 commit message 用繁體中文，說明「為什麼」而不只是「做了什麼」。

不要每一步都等待確認。小型產品與設計決策自行選最合理、最一致的方案。只有涉及費用、隱私、外部服務或大幅改變產品方向時才詢問。

━━━━━━━━━━━━━━━━━━
二十三、最終驗收標準
━━━━━━━━━━━━━━━━━━

- 不需要 API Key、不產生語音 API 費用
- 第一次使用者能在 30 秒內開始快速模式
- 支援同一段落中包含繁體中文與英文；不自動翻譯原始內容
- 本機雙語模式不將音訊送到後端；模型推論不凍結 UI
- 模型下載有進度、取消、錯誤、重試，且能被快取
- Interim 文字不造成布局跳動；Whisper 區塊不產生大量重複
- 向上閱讀時不被強制捲回底部
- 任一引擎失敗後已完成逐字稿仍存在
- 個人筆記與逐字稿清楚分離；可編輯、搜尋、標記、複製、匯出
- 重新整理後能找回課程
- 手機與桌面都有經過設計的體驗；不支援的裝置有誠實可操作的降級
- 校正規則的替換可見、可還原；沒有明確規則時不改逐字稿
- 對照翻譯預設關閉，開啟後不改動原文，不支援時開關不出現
- 沒有假的 AI 功能；視覺專業、安靜、精準，不像 AI landing page 模板

在 Chrome 手動驗收：

1. 唸一段含 NPV、WACC 的中文句子，原文正確、術語保留英文大小寫
2. 靜音 90 秒後再講話，仍能繼續辨識、沒有漏字
3. 切到背景分頁再切回，有警告且已完成內容仍在
4. 重新整理頁面，逐字稿還在
5. 匯出 Markdown 可正常打開，有時間戳

現在請直接開始檢視、設計與實作，不要只回覆計畫。

━━━━━━━━━━━━━━━━━━
附錄：兩份 prompt 的衝突與定案
━━━━━━━━━━━━━━━━━━

| 衝突 | v2 | 產品規格版 | 定案 |
|---|---|---|---|
| 翻譯 | 四種輸出模式含中／英／對照 | 不自動翻譯 | 逐字稿永遠保留原文；翻譯改為預設關閉的選配對照層，只用 Chrome 內建 Translator |
| 摘要 | Chrome Summarizer，退路是複製提示詞 | 不做 AI 摘要 | 應用內不做摘要；匯出可附摘要提示詞 |
| 術語處理 | 自動套用「聽錯 → 正確」校正表 | 詞彙表只當辨識提示，不偷改逐字稿 | 兩者都留：詞彙表做提示；校正規則使用者自建、預設關閉、替換可見可還原 |
| 技術棧 | 純 HTML／JS，不用 npm | Next.js + TypeScript + Tailwind | 採 Next.js static export，因為 Whisper worker、IndexedDB、狀態機與測試需要工程結構 |
| 儲存 | localStorage | IndexedDB | IndexedDB 存資料，localStorage 存偏好 |
| 開發流程 | 先出架構確認再寫程式 | 不要每步等確認 | 不等確認，直接實作 |
| 部署 | GitHub Pages | 未指定 | GitHub Pages，Next.js 用 static export |
| 沒有 WebGPU 的電腦 | 只能快速模式 | 不使用付費或需金鑰的 API | 追加「自備金鑰（Groq）」第三引擎：預設不啟用、key 只存本機、免費額度；原本兩個免費引擎不變 |
