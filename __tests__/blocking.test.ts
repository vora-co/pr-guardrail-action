import { decide, evaluateBlockingRule } from "../src/blocking";
import { SignalResult } from "../src/types";

function signal(id: SignalResult["id"], detected: boolean): SignalResult {
  return { id, detected, details: detected ? ["detail"] : [] };
}

const noSignals: SignalResult[] = [
  signal("co-authored-by-agent", false),
  signal("risky-file", false),
  signal("shell-command", false),
  signal("volume-anomaly", false),
];

describe("evaluateBlockingRule", () => {
  it("does not block when nothing is detected", () => {
    expect(evaluateBlockingRule(noSignals).shouldBlock).toBe(false);
  });

  it("blocks on risky-file alone", () => {
    const signals = [...noSignals.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const result = evaluateBlockingRule(signals);
    expect(result.shouldBlock).toBe(true);
    expect(result.blockingSignals).toEqual(["risky-file"]);
  });

  it("blocks on shell-command alone", () => {
    const signals = [...noSignals.filter((s) => s.id !== "shell-command"), signal("shell-command", true)];
    const result = evaluateBlockingRule(signals);
    expect(result.shouldBlock).toBe(true);
    expect(result.blockingSignals).toEqual(["shell-command"]);
  });

  it("does NOT block on co-authored-by-agent alone", () => {
    const signals = [
      ...noSignals.filter((s) => s.id !== "co-authored-by-agent"),
      signal("co-authored-by-agent", true),
    ];
    const result = evaluateBlockingRule(signals);
    expect(result.shouldBlock).toBe(false);
    expect(result.blockingSignals).toEqual([]);
  });

  it("does NOT block on volume-anomaly alone (no agent footprint)", () => {
    const signals = [
      ...noSignals.filter((s) => s.id !== "volume-anomaly"),
      signal("volume-anomaly", true),
    ];
    const result = evaluateBlockingRule(signals);
    expect(result.shouldBlock).toBe(false);
    expect(result.blockingSignals).toEqual([]);
  });

  it("blocks when volume-anomaly AND co-authored-by-agent co-occur", () => {
    const signals = [
      signal("co-authored-by-agent", true),
      signal("risky-file", false),
      signal("shell-command", false),
      signal("volume-anomaly", true),
    ];
    const result = evaluateBlockingRule(signals);
    expect(result.shouldBlock).toBe(true);
    expect(result.blockingSignals).toEqual(["volume-anomaly"]);
  });

  it("reports every contributing signal when several block at once", () => {
    const signals = [
      signal("co-authored-by-agent", true),
      signal("risky-file", true),
      signal("shell-command", false),
      signal("volume-anomaly", true),
    ];
    const result = evaluateBlockingRule(signals);
    expect(result.blockingSignals).toEqual(["risky-file", "volume-anomaly"]);
  });
});

describe("decide", () => {
  it("succeeds in warn mode even when a blocking signal fires", () => {
    const signals = [...noSignals.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const result = decide(signals, "warn", false);
    expect(result.conclusion).toBe("success");
    expect(result.shouldBlock).toBe(true);
  });

  it("fails in block mode when a blocking signal fires and there is no human approval", () => {
    const signals = [...noSignals.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const result = decide(signals, "block", false);
    expect(result.conclusion).toBe("failure");
  });

  it("succeeds in block mode when a blocking signal fires but a human has approved", () => {
    const signals = [...noSignals.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const result = decide(signals, "block", true);
    expect(result.conclusion).toBe("success");
  });

  it("succeeds in block mode when nothing blocks, regardless of approval", () => {
    const result = decide(noSignals, "block", false);
    expect(result.conclusion).toBe("success");
  });

  it("defaults gateVia to 'none' and 'human-review' when not passed explicitly (off mode, unchanged behavior)", () => {
    const signals = [...noSignals.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    expect(decide(signals, "block", false).gateVia).toBe("none");
    expect(decide(signals, "block", true).gateVia).toBe("human-review");
  });

  it("carries an explicit gateVia and gateDetail through untouched", () => {
    const signals = [...noSignals.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const result = decide(signals, "block", true, "self-ack", "Acknowledged by the author");
    expect(result.conclusion).toBe("success");
    expect(result.gateVia).toBe("self-ack");
    expect(result.gateDetail).toBe("Acknowledged by the author");
  });
});
