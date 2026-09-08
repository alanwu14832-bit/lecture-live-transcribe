import { Suspense } from "react";
import { LiveScreen } from "@/features/live/LiveScreen";

// 靜態輸出沒有動態路由，課堂 id 走 query string；useSearchParams 需要 Suspense 邊界
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LiveScreen />
    </Suspense>
  );
}
