import { Icon } from "./Icon";

export function PrivacyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`flex gap-2 text-secondary ${compact ? "text-xs" : "text-sm"}`}>
      <Icon name="info" size={compact ? 14 : 16} className="shrink-0 mt-0.5" />
      <span>轉錄內容只儲存在這台裝置。我們不保存原始錄音。開始前請確認已取得授課者與參與者同意。</span>
    </p>
  );
}
