import { describe, expect, it } from "vitest";
import { initialMachineState, transition, type MachineState } from "./session-machine";
import { ERRORS } from "./errors";

function run(events: Parameters<typeof transition>[1][], from: MachineState = initialMachineState) {
  return events.reduce((s, e) => transition(s, e), from);
}

describe("session state machine", () => {
  it("走完正常流程：檢查 → 權限 → 就緒 → 聆聽 → 結束", () => {
    const s = run([
      { type: "CHECK" },
      { type: "REQUEST_PERMISSION" },
      { type: "PERMISSION_GRANTED", needsModel: false },
      { type: "START" },
    ]);
    expect(s.status).toBe("listening");
    expect(run([{ type: "END" }], s).status).toBe("ended");
  });

  it("需要模型時先進 downloading-model，模型好了才 ready", () => {
    const s = run([{ type: "CHECK" }, { type: "REQUEST_PERMISSION" }, { type: "PERMISSION_GRANTED", needsModel: true }]);
    expect(s.status).toBe("downloading-model");
    expect(transition(s, { type: "START" }).status).toBe("downloading-model");
    expect(transition(s, { type: "MODEL_READY" }).status).toBe("ready");
  });

  it("聆聽中引擎意外停止 → recovering → 恢復後回到 listening 並歸零計數", () => {
    const listening = run([{ type: "CHECK" }, { type: "CAPABILITY_OK" }, { type: "START" }]);
    const dropped = transition(listening, { type: "ENGINE_DROPPED" });
    expect(dropped.status).toBe("recovering");
    expect(dropped.recoveryAttempts).toBe(1);
    const again = transition(dropped, { type: "ENGINE_DROPPED" });
    expect(again.recoveryAttempts).toBe(2);
    const recovered = transition(again, { type: "RECOVERED" });
    expect(recovered.status).toBe("listening");
    expect(recovered.recoveryAttempts).toBe(0);
  });

  it("暫停後引擎 onend 不會讓狀態變成 recovering（不可自行重啟）", () => {
    const paused = run([{ type: "CHECK" }, { type: "CAPABILITY_OK" }, { type: "START" }, { type: "PAUSE" }]);
    expect(paused.status).toBe("paused");
    expect(transition(paused, { type: "ENGINE_DROPPED" }).status).toBe("paused");
    expect(transition(paused, { type: "RECOVERED" }).status).toBe("paused");
  });

  it("結束後任何事件都不會改變狀態", () => {
    const ended = run([{ type: "CHECK" }, { type: "CAPABILITY_OK" }, { type: "START" }, { type: "END" }]);
    expect(transition(ended, { type: "ENGINE_DROPPED" }).status).toBe("ended");
    expect(transition(ended, { type: "FAIL", error: ERRORS.unknown("x") }).status).toBe("ended");
    expect(transition(ended, { type: "START" }).status).toBe("ended");
  });

  it("錯誤保留來源狀態，重試回到 ready", () => {
    const listening = run([{ type: "CHECK" }, { type: "CAPABILITY_OK" }, { type: "START" }]);
    const failed = transition(listening, { type: "FAIL", error: ERRORS.recognitionFailed() });
    expect(failed.status).toBe("error");
    expect(failed.previous).toBe("listening");
    expect(failed.error?.code).toBe("recognition-failed");
    const retried = transition(failed, { type: "RETRY" });
    expect(retried.status).toBe("ready");
    expect(retried.error).toBeNull();
  });

  it("processing 只在 listening 與 processing 之間切換", () => {
    const listening = run([{ type: "CHECK" }, { type: "CAPABILITY_OK" }, { type: "START" }]);
    const busy = transition(listening, { type: "PROCESSING", busy: true });
    expect(busy.status).toBe("processing");
    expect(transition(busy, { type: "PROCESSING", busy: false }).status).toBe("listening");
    const paused = transition(busy, { type: "PAUSE" });
    expect(transition(paused, { type: "PROCESSING", busy: true }).status).toBe("paused");
  });

  it("RESET 回到 idle 並清掉錯誤，但結束後不能重置", () => {
    const failed = run([{ type: "CHECK" }, { type: "CAPABILITY_OK" }, { type: "START" }, { type: "FAIL", error: ERRORS.permissionDenied() }]);
    const reset = transition(failed, { type: "RESET" });
    expect(reset.status).toBe("idle");
    expect(reset.error).toBeNull();
    const ended = transition(failed, { type: "END" });
    expect(transition(ended, { type: "RESET" }).status).toBe("ended");
  });
});
