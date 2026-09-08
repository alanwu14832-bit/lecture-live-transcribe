/**
 * 快捷鍵守門：使用者正在打字時，Space、N 這些鍵都必須交給輸入框。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export type Shortcut = "toggle-pause" | "new-note" | "search" | "save" | "escape" | null;

export function resolveShortcut(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">): Shortcut {
  const typing = isTypingTarget(e.target);
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === "Escape") return "escape";
  if (mod && e.key.toLowerCase() === "f") return "search";
  if (mod && e.key.toLowerCase() === "s") return "save";
  if (typing || mod || e.altKey) return null;
  if (e.key === " ") return "toggle-pause";
  if (e.key.toLowerCase() === "n") return "new-note";
  return null;
}
