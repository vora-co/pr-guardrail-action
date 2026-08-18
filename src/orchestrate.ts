import * as core from "@actions/core";
import { GateVia, GuardrailDecision, decide } from "./blocking";
import { detectRequiredStatusCheck, requiredStatusCheckNotice } from "./branchProtection";
import { buildComment } from "./comment";
import { GuardrailConfig } from "./config";
import {
  CHECK_RUN_NAME,
  Octokit,
  RepoRef,
  completeCheckRun,
  createCheckRun,
  fetchIssueComments,
  fetchPullCommits,
  fetchPullFiles,
  fetchPullReviews,
  upsertGuardrailComment,
} from "./github";
import { hasValidHumanApproval, isAllowlistedBot } from "./humanGate";
import { detectCoAuthoredByAgent } from "./signals/coAuthoredByAgent";
import { detectRiskyFile } from "./signals/riskyFile";
import { detectShellCommand } from "./signals/shellCommand";
import { detectVolumeAnomaly } from "./signals/volumeAnomaly";
import { evaluateSecondAgent, evaluateSelfAck } from "./soloMaintainer";
import { SignalResult } from "./types";

export interface OrchestrateInput {
  octokit: Octokit;
  repoRef: RepoRef;
  pullNumber: number;
  headSha: string;
  baseBranch: string;
  authorLogin: string;
  config: GuardrailConfig;
}

export type OrchestrateResult =
  | { outcome: "skipped-bot" }
  | { outcome: "pending-no-commits" }
  | { outcome: "evaluated"; decision: GuardrailDecision };

export async function runGuardrail(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { octokit, repoRef, pullNumber, headSha, baseBranch, authorLogin, config } = input;

  if (isAllowlistedBot(authorLogin, config.botAllowlist)) {
    core.info(`Author "${authorLogin}" is on the bot allowlist — skipping analysis.`);
    return { outcome: "skipped-bot" };
  }

  const checkRunId = await createCheckRun(octokit, repoRef, headSha);

  const [files, commits, reviews, requiredCheckState] = await Promise.all([
    fetchPullFiles(octokit, repoRef, pullNumber),
    fetchPullCommits(octokit, repoRef, pullNumber),
    fetchPullReviews(octokit, repoRef, pullNumber),
    detectRequiredStatusCheck(octokit, repoRef, baseBranch, CHECK_RUN_NAME),
  ]);

  if (commits.length === 0) {
    core.warning(
      "No commits found on this PR yet — GitHub may not have finished syncing them. " +
        "Leaving the check run in progress instead of asserting a result."
    );
    return { outcome: "pending-no-commits" };
  }

  const signals: SignalResult[] = [
    detectCoAuthoredByAgent(commits),
    detectRiskyFile(files, config.riskyFilePatterns),
    detectShellCommand(files),
    detectVolumeAnomaly(files, commits, config.volumeThreshold, config.timeWindowMinutes),
  ];

  let hasHumanApproval: boolean;
  let gateVia: GateVia;
  let gateDetail: string | undefined;

  if (config.soloMaintainerMode === "second-agent") {
    // Second-agent mode REPLACES the native "any non-author approval counts"
    // check rather than adding to it: that native check would otherwise let
    // ANY reviewer — allowlisted or not — satisfy the gate, making the
    // allowlist meaningless and defeating the "not trivially forgeable with
    // a second bot token" requirement. With this mode on, only an approval
    // from a login explicitly in trusted-reviewer-agents counts.
    const result = evaluateSecondAgent(authorLogin, reviews, config.trustedReviewerAgents);
    hasHumanApproval = result.satisfied;
    gateVia = result.satisfied ? "second-agent" : "none";
    gateDetail = result.detail;
  } else {
    const hasNativeApproval = hasValidHumanApproval(authorLogin, reviews);
    hasHumanApproval = hasNativeApproval;
    gateVia = hasNativeApproval ? "human-review" : "none";

    if (!hasHumanApproval && config.soloMaintainerMode === "self-ack") {
      const comments = await fetchIssueComments(octokit, repoRef, pullNumber);
      const lastPushAt = commits.reduce(
        (latest, commit) => (commit.authorDate > latest ? commit.authorDate : latest),
        commits[0].authorDate
      );
      const result = evaluateSelfAck(
        authorLogin,
        comments,
        lastPushAt,
        config.selfAckMinLength,
        config.selfAckCooldownMinutes
      );
      if (result.satisfied) {
        hasHumanApproval = true;
        gateVia = "self-ack";
        gateDetail = result.detail;
      }
    }
  }

  const decision = decide(signals, config.mode, hasHumanApproval, gateVia, gateDetail);
  const notice = requiredStatusCheckNotice(requiredCheckState, CHECK_RUN_NAME);
  const comment = buildComment(decision, config.mode, notice);

  try {
    await upsertGuardrailComment(octokit, repoRef, pullNumber, comment);
  } catch (error) {
    core.warning(
      `Could not post the PR comment (likely a read-only token on a fork PR): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  await completeCheckRun(octokit, repoRef, checkRunId, decision.conclusion, comment);

  return { outcome: "evaluated", decision };
}
