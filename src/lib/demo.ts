/**
 * 示範課堂：讓第一次打開的人看到成品長什麼樣。
 * 內容標明是示範，沒有假數據、假評論。
 */
import type { PersonalNote, Session, TranscriptSegment } from "./types";
import { newId } from "./types";

export function buildDemoSession() {
  const created = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2);
  const iso = created.toISOString();
  const sessionId = newId();
  const session: Session = {
    id: sessionId,
    title: "示範：企業評價（DCF）",
    languageMode: "mixed",
    transcriptionEngine: "web-speech",
    translationEnabled: false,
    notesOpen: true,
    createdAt: iso,
    updatedAt: iso,
    startedAt: iso,
    endedAt: new Date(created.getTime() + 1000 * 60 * 47).toISOString(),
    duration: 47 * 60,
    status: "ended",
  };
  const lines: Array<[number, string]> = [
    [12, "各位早，今天我們把上週的 case 接下來講。這家公司的 revenue growth 雖然很高，但 operating margin 還沒有改善，所以市場一直在問它的獲利模式到底能不能 scale。"],
    [58, "要回答這個問題，我們需要做 DCF valuation。第一步是把 free cash flow 投影出去，第二步決定 discount rate，也就是 WACC，第三步處理 terminal value。"],
    [131, "WACC 的部分，cost of equity 我們用 CAPM 估，cost of debt 用它最近發債的殖利率。很多同學會忘記 tax shield，記得利息是可以抵稅的。"],
    [214, "Terminal growth rate 是整個模型最敏感的假設。如果你設 4%，等於是說這家公司永遠比 GDP 成長得快，這在邏輯上就站不住。通常我們會用 2% 到 3%。"],
    [302, "接下來看 sensitivity table。橫軸是 WACC，縱軸是 terminal growth rate，你會發現 enterprise value 在這兩個變數之間的範圍非常大，這就是為什麼分析師報告永遠會給一個區間而不是一個數字。"],
    [389, "最後提醒，DCF 只是工具，關鍵是你對這家公司 competitive advantage 的判斷。network effect 存不存在、switching cost 高不高，這些才決定 cash flow 能不能持續。"],
  ];
  const segments: TranscriptSegment[] = lines.map(([t, text], i) => ({
    id: newId(),
    sessionId,
    text,
    rawText: null,
    timestamp: t,
    endTimestamp: t + 40,
    detectedLanguage: "mixed",
    translation: null,
    isBookmarked: i === 3,
    editedByUser: false,
    createdAt: iso,
    updatedAt: iso,
  }));
  const notes: PersonalNote[] = [
    { id: newId(), sessionId, text: "Terminal growth 不能高於長期 GDP 成長率，期中考很可能考。", tag: "exam", timestamp: 230, referencedSegmentId: segments[3].id, createdAt: iso, updatedAt: iso },
    { id: newId(), sessionId, text: "tax shield 怎麼算進 WACC 的公式要再看一次講義。", tag: "unclear", timestamp: 150, referencedSegmentId: segments[2].id, createdAt: iso, updatedAt: iso },
  ];
  return { session, segments, notes };
}
