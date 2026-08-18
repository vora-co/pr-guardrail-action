import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config";
import { runGuardrail } from "./orchestrate";

async function run(): Promise<void> {
  try {
    const config = loadConfig();
    const token = core.getInput("github-token", { required: true });
    const octokit = github.getOctokit(token);
    const context = github.context;

    const pullRequest = context.payload.pull_request;
    if (!pullRequest) {
      core.info(`Event "${context.eventName}" has no associated pull request — nothing to do.`);
      return;
    }

    const result = await runGuardrail({
      octokit,
      repoRef: { owner: context.repo.owner, repo: context.repo.repo },
      pullNumber: pullRequest.number,
      headSha: pullRequest.head.sha,
      baseBranch: pullRequest.base.ref,
      authorLogin: pullRequest.user?.login ?? "",
      config,
    });

    if (result.outcome === "skipped-bot") {
      core.info("Skipped: author is on the bot allowlist.");
      return;
    }

    if (result.outcome === "pending-no-commits") {
      core.info("Skipped: no commits synced yet. The check run stays in progress.");
      return;
    }

    const { decision } = result;
    core.setOutput("conclusion", decision.conclusion);
    core.setOutput("blocking-signals", decision.blockingSignals.join(","));

    if (decision.conclusion === "failure") {
      core.setFailed(
        `Blocked by: ${decision.blockingSignals.join(", ")}. ` +
          "Needs an explicit approval from a reviewer other than the author."
      );
    } else {
      core.info(`PR Guardrail passed (mode: ${config.mode}).`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
