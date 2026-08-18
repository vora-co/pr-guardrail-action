import { Mode } from "./config";
import { SignalId, SignalResult } from "./types";

/** How the human gate ended up satisfied — carried through purely for reporting. */
export type GateVia = "human-review" | "self-ack" | "second-agent" | "none";

export interface GuardrailDecision {
  signals: SignalResult[];
  /** Signals that actually contributed to the blocking verdict. */
  blockingSignals: SignalId[];
  /** The raw risk verdict, independent of `mode` and human approval. */
  shouldBlock: boolean;
  /** Whether a human other than the author has approved the PR. */
  hasHumanApproval: boolean;
  /** Which mechanism satisfied the gate — never asserted as independent human review unless it is one. */
  gateVia: GateVia;
  gateDetail?: string;
  /** Final check run conclusion after applying `mode` and human approval. */
  conclusion: "success" | "failure";
}

/**
 * Two-level blocking rule (see SPEC.md "Regla de bloqueo"):
 * - risky-file and shell-command block on their own — the file/command's
 *   intrinsic risk matters regardless of who authored it.
 * - co-authored-by-agent is contextual only: it's reported but never blocks
 *   by itself, because most code today is AI-assisted and gating on mere
 *   presence would stop normal workflow.
 * - volume-anomaly only blocks when it co-occurs with co-authored-by-agent
 *   in the same PR (large AI-generated change with no visibility).
 */
export function evaluateBlockingRule(signals: SignalResult[]): {
  shouldBlock: boolean;
  blockingSignals: SignalId[];
} {
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const blockingSignals: SignalId[] = [];

  const riskyFile = byId.get("risky-file");
  if (riskyFile?.detected) blockingSignals.push("risky-file");

  const shellCommand = byId.get("shell-command");
  if (shellCommand?.detected) blockingSignals.push("shell-command");

  const coAuthoredByAgent = byId.get("co-authored-by-agent");
  const volumeAnomaly = byId.get("volume-anomaly");
  if (volumeAnomaly?.detected && coAuthoredByAgent?.detected) {
    blockingSignals.push("volume-anomaly");
  }

  return { shouldBlock: blockingSignals.length > 0, blockingSignals };
}

export function decide(
  signals: SignalResult[],
  mode: Mode,
  hasHumanApproval: boolean,
  gateVia: GateVia = hasHumanApproval ? "human-review" : "none",
  gateDetail?: string
): GuardrailDecision {
  const { shouldBlock, blockingSignals } = evaluateBlockingRule(signals);
  const conclusion: "success" | "failure" =
    mode === "block" && shouldBlock && !hasHumanApproval ? "failure" : "success";

  return { signals, blockingSignals, shouldBlock, hasHumanApproval, gateVia, gateDetail, conclusion };
}
