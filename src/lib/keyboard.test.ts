import { describe, expect, it } from "vitest";
import { isTypingTarget, resolveShortcut } from "./keyboard";

function el(tag: string, editable = false) {
  return { tagName: tag.toUpperCase(), isContentEditable: editable } as unknown as HTMLElement;
}

describe("isTypingTarget", () => {
  it("輸入框、文字區、可編輯元素都算打字中", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
    expect(isTypingTarget(el("textarea"))).toBe(true);
    expect(isTypingTarget(el("div", true))).toBe(true);
    expect(isTypingTarget(el("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("resolveShortcut", () => {
  it("不在打字時 Space 與 N 觸發快捷鍵", () => {
    expect(resolveShortcut({ key: " ", metaKey: false, ctrlKey: false, altKey: false, target: el("div") })).toBe("toggle-pause");
    expect(resolveShortcut({ key: "n", metaKey: false, ctrlKey: false, altKey: false, target: el("div") })).toBe("new-note");
  });
  it("打字中 Space 與 N 不被攔截", () => {
    expect(resolveShortcut({ key: " ", metaKey: false, ctrlKey: false, altKey: false, target: el("textarea") })).toBeNull();
    expect(resolveShortcut({ key: "n", metaKey: false, ctrlKey: false, altKey: false, target: el("input") })).toBeNull();
  });
  it("Cmd/Ctrl+F 與 Cmd/Ctrl+S 在打字時也有效，Esc 永遠有效", () => {
    expect(resolveShortcut({ key: "f", metaKey: true, ctrlKey: false, altKey: false, target: el("input") })).toBe("search");
    expect(resolveShortcut({ key: "s", metaKey: false, ctrlKey: true, altKey: false, target: el("textarea") })).toBe("save");
    expect(resolveShortcut({ key: "Escape", metaKey: false, ctrlKey: false, altKey: false, target: el("input") })).toBe("escape");
  });
});
