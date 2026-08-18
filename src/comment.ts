import { GuardrailDecision } from "./blocking";
import { Mode } from "./config";
import { SignalId, SignalResult } from "./types";

const SIGNAL_LABELS: Record<SignalId, string> = {
  "co-authored-by-agent": "AI co-author trailer",
  "risky-file": "High-risk file",
  "shell-command": "Shell command in diff",
  "volume-anomaly": "Anomalous change volume",
};

function renderSignal(signal: SignalResult, isBlocking: boolean): string {
  const icon = signal.detected ? (isBlocking ? "🛑" : "ℹ️") : "✅";
  const label = SIGNAL_LABELS[signal.id];
  const lines = [`${icon} **${label}**`];

  if (signal.detected && signal.details.length > 0) {
    for (const detail of signal.details) {
      lines.push(`  - ${detail}`);
    }
  } else if (!signal.detected) {
    lines[0] += " — not detected";
  }

  return lines.join("\n");
}

export function buildComment(decision: GuardrailDecision, mode: Mode): string {
  const { signals, blockingSignals, shouldBlock, hasHumanApproval, gateVia, gateDetail, conclusion } =
    decision;
  const blockingSet = new Set(blockingSignals);

  const lines: string[] = ["## PR Guardrail report", ""];

  for (const signal of signals) {
    lines.push(renderSignal(signal, blockingSet.has(signal.id)));
  }

  lines.push("");

  if (!shouldBlock) {
    lines.push("No blocking signals detected.");
  } else if (mode === "warn") {
    lines.push(
      "⚠️ Running in **warn** mode: this PR would be blocked in `block` mode, but the check is reporting success."
    );
  } else if (hasHumanApproval && gateVia === "self-ack") {
    lines.push(
      `⚠️ Gate satisfied via **self-ack** (solo-maintainer-mode) — not independent human review.` +
        (gateDetail ? ` ${gateDetail}` : "")
    );
  } else if (hasHumanApproval && gateVia === "second-agent") {
    lines.push(
      `⚠️ Gate satisfied via **second-agent review** (solo-maintainer-mode) — not independent human review.` +
        (gateDetail ? ` ${gateDetail}` : "")
    );
  } else if (hasHumanApproval) {
    lines.push(
      "✅ A human reviewer other than the author has approved this PR — the gate is satisfied."
    );
  } else {
    lines.push(
      "🔒 This PR is **blocked**. It needs an explicit approval from a reviewer who is not the author " +
        "(self-approval doesn't count, and a revoked approval re-blocks it)."
    );
  }

  lines.push("");
  lines.push(`Check conclusion: **${conclusion}** (mode: \`${mode}\`)`);

  return lines.join("\n");
}
