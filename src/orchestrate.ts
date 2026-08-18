import * as core from "@actions/core";
import { GuardrailDecision, decide } from "./blocking";
import { buildComment } from "./comment";
import { GuardrailConfig } from "./config";
import {
  Octokit,
  RepoRef,
  completeCheckRun,
  createCheckRun,
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
import { SignalResult } from "./types";

export interface OrchestrateInput {
  octokit: Octokit;
  repoRef: RepoRef;
  pullNumber: number;
  headSha: string;
  authorLogin: string;
  config: GuardrailConfig;
}

export type OrchestrateResult =
  | { outcome: "skipped-bot" }
  | { outcome: "pending-no-commits" }
  | { outcome: "evaluated"; decision: GuardrailDecision };

export async function runGuardrail(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { octokit, repoRef, pullNumber, headSha, authorLogin, config } = input;

  if (isAllowlistedBot(authorLogin, config.botAllowlist)) {
    core.info(`Author "${authorLogin}" is on the bot allowlist — skipping analysis.`);
    return { outcome: "skipped-bot" };
  }

  const checkRunId = await createCheckRun(octokit, repoRef, headSha);

  const [files, commits, reviews] = await Promise.all([
    fetchPullFiles(octokit, repoRef, pullNumber),
    fetchPullCommits(octokit, repoRef, pullNumber),
    fetchPullReviews(octokit, repoRef, pullNumber),
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

  const hasHumanApproval = hasValidHumanApproval(authorLogin, reviews);
  const decision = decide(signals, config.mode, hasHumanApproval);
  const comment = buildComment(decision, config.mode);

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
