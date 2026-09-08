"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import type { CorrectionRule, TranscriptSegment } from "@/lib/types";
import { SegmentItem, type SegmentActions } from "./SegmentItem";

export function TranscriptView({
  segments, interim, query, currentMatchId, rules, actions, showTranslation, live, emptyHint,
}: {
  segments: TranscriptSegment[]; interim: string; query: string; currentMatchId: string | null; rules: CorrectionRule[];
  actions: SegmentActions; showTranslation: boolean; live: boolean; emptyHint: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    // 使用者往上看就立刻停止跟隨；只有回到底部（或按按鈕）才恢復
    if (atBottom !== followRef.current) {
      followRef.current = atBottom;
      setFollow(atBottom);
    }
  }, []);

  const lastLen = useMemo(() => segments.reduce((n, s) => n + s.text.length, 0), [segments]);
  useLayoutEffect(() => {
    if (!live || !followRef.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastLen, interim, live]);

  useEffect(() => {
    if (!currentMatchId) return;
    document.getElementById(`seg-${currentMatchId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentMatchId]);

  const jumpToLatest = () => {
    const el = scroller.current;
    if (!el) return;
    followRef.current = true;
    setFollow(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-2 sm:px-6 pt-4 pb-40">
        <div className="mx-auto max-w-reading">
          {segments.length === 0 && !interim && <div className="pt-16 text-center text-secondary text-sm">{emptyHint}</div>}
          {segments.map((s) => (
            <SegmentItem key={s.id} seg={s} query={query} rules={rules} actions={actions} showTranslation={showTranslation} isCurrentMatch={s.id === currentMatchId} />
          ))}
          {live && (
            // interim 固定在最新內容下方，佔固定高度，不推動整頁布局
            <div className="pl-14 sm:pl-16 pr-2 py-2 min-h-[3.2em]" aria-hidden={!interim}>
              <p className="reading text-secondary/70">{interim}</p>
            </div>
          )}
        </div>
      </div>
      {live && !follow && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 fade-in">
          <Button variant="secondary" size="sm" icon="arrowDown" onClick={jumpToLatest} className="shadow-overlay">回到最新內容</Button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {/* 只朗讀「新增了段落」而不是每個 interim 字詞 */}
        {segments.length > 0 ? `共 ${segments.length} 段` : ""}
      </span>
      {segments.length > 0 && query && (
        <span className="sr-only"><Icon name="search" size={1} />搜尋中</span>
      )}
    </div>
  );
}
