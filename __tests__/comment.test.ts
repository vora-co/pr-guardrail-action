import { buildComment } from "../src/comment";
import { decide } from "../src/blocking";
import { SignalResult } from "../src/types";

function signal(id: SignalResult["id"], detected: boolean, details: string[] = []): SignalResult {
  return { id, detected, details: detected ? details.length ? details : ["detail"] : [] };
}

const clean: SignalResult[] = [
  signal("co-authored-by-agent", false),
  signal("risky-file", false),
  signal("shell-command", false),
  signal("volume-anomaly", false),
];

describe("buildComment", () => {
  it("reports no blocking signals when everything is clean", () => {
    const decision = decide(clean, "block", false);
    const comment = buildComment(decision, "block");
    expect(comment).toContain("No blocking signals detected.");
  });

  it("shows the blocked message when a blocking signal fires without human approval", () => {
    const signals = [...clean.filter((s) => s.id !== "risky-file"), signal("risky-file", true, ["infra/main.tf"])];
    const decision = decide(signals, "block", false);
    const comment = buildComment(decision, "block");
    expect(comment).toContain("blocked");
    expect(comment).toContain("infra/main.tf");
  });

  it("shows the satisfied-gate message once a human has approved", () => {
    const signals = [...clean.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const decision = decide(signals, "block", true);
    const comment = buildComment(decision, "block");
    expect(comment).toContain("gate is satisfied");
  });

  it("shows the warn-mode disclaimer instead of blocking in warn mode", () => {
    const signals = [...clean.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const decision = decide(signals, "warn", false);
    const comment = buildComment(decision, "warn");
    expect(comment).toContain("warn");
    expect(comment).not.toContain("🔒");
  });

  it("labels a self-ack gate explicitly as not independent human review", () => {
    const signals = [...clean.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const decision = decide(signals, "block", true, "self-ack", "Acknowledged by the author on X");
    const comment = buildComment(decision, "block");
    expect(comment).toContain("self-ack");
    expect(comment).toContain("not independent human review");
    expect(comment).toContain("Acknowledged by the author on X");
  });

  it("labels a second-agent gate explicitly as not independent human review", () => {
    const signals = [...clean.filter((s) => s.id !== "risky-file"), signal("risky-file", true)];
    const decision = decide(signals, "block", true, "second-agent", 'Approved by trusted reviewer agent "review-bot".');
    const comment = buildComment(decision, "block");
    expect(comment).toContain("second-agent");
    expect(comment).toContain("not independent human review");
    expect(comment).toContain("review-bot");
  });

  it("appends the required-status-check notice when one is passed", () => {
    const decision = decide(clean, "block", false);
    const comment = buildComment(decision, "block", 'ℹ️ This check ("vora-guardrail") is not configured as a required status check.');
    expect(comment).toContain("not configured as a required status check");
  });

  it("omits any notice section when none is passed", () => {
    const decision = decide(clean, "block", false);
    const comment = buildComment(decision, "block", null);
    expect(comment).not.toContain("ℹ️ This check");
  });

  it("marks co-authored-by-agent as informational, not blocking, even when detected", () => {
    const signals = [
      signal("co-authored-by-agent", true, ["abc123: Co-authored-by: Claude <noreply@anthropic.com>"]),
      signal("risky-file", false),
      signal("shell-command", false),
      signal("volume-anomaly", false),
    ];
    const decision = decide(signals, "block", false);
    const comment = buildComment(decision, "block");
    expect(comment).toContain("ℹ️");
    expect(comment).toContain("No blocking signals detected.");
  });
});
