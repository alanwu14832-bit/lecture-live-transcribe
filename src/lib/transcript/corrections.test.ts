import { describe, expect, it } from "vitest";
import { applyRules, highlightReplacements, suggestRuleFromEdit } from "./corrections";
import type { CorrectionRule } from "../types";

const rule = (from: string, to: string, enabled = true): CorrectionRule => ({ id: from, from, to, enabled, createdAt: "" });

describe("applyRules", () => {
  it("沒有規則時一個字都不改", () => {
    const r = applyRules("安批威很高", []);
    expect(r.text).toBe("安批威很高");
    expect(r.changed).toBe(false);
  });
  it("關閉的規則不套用", () => {
    expect(applyRules("安批威很高", [rule("安批威", "NPV", false)]).changed).toBe(false);
  });
  it("套用中文規則並記錄", () => {
    const r = applyRules("今天的安批威很高", [rule("安批威", "NPV")]);
    expect(r.text).toBe("今天的 NPV很高".replace(" ", ""));
    expect(r.applied).toEqual([{ from: "安批威", to: "NPV" }]);
  });
  it("英文規則整字比對且不分大小寫，不會改到子字串", () => {
    const r = applyRules("the wacc and the waccs", [rule("wacc", "WACC")]);
    expect(r.text).toBe("the WACC and the waccs");
  });
});

describe("suggestRuleFromEdit", () => {
  it("局部修正產生規則", () => {
    expect(suggestRuleFromEdit("今天的安批威很高", "今天的 NPV 很高")).toEqual({ from: "安批威", to: "NPV" });
  });
  it("整段重寫不產生規則", () => {
    expect(suggestRuleFromEdit("這是一段很長很長很長很長很長很長很長的原文內容", "完全不同的另一段很長很長很長很長很長很長的內容")).toBeNull();
  });
  it("沒有改動回 null", () => {
    expect(suggestRuleFromEdit("一樣", "一樣")).toBeNull();
  });
});

describe("highlightReplacements", () => {
  it("把被替換的字切出來", () => {
    const parts = highlightReplacements("今天的NPV很高", [{ from: "安批威", to: "NPV" }]);
    expect(parts).toEqual([{ text: "今天的" }, { text: "NPV", from: "安批威" }, { text: "很高" }]);
  });
});
