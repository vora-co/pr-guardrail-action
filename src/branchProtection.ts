import * as core from "@actions/core";
import { Octokit, RepoRef } from "./github";

export type RequiredStatusCheckState = "required" | "not-required" | "unknown";

/**
 * Best-effort, read-only probe of branch protection. A private repo on
 * GitHub Free doesn't have this feature at all and the API responds with a
 * 403/404 — that's an expected, common case, not an error, so it must never
 * throw or crash the run. Any other unexpected failure is also treated as
 * "unknown" rather than risking a crash over a purely informational check.
 */
export async function detectRequiredStatusCheck(
  octokit: Octokit,
  repoRef: RepoRef,
  branch: string,
  checkName: string
): Promise<RequiredStatusCheckState> {
  try {
    const { data } = await octokit.rest.repos.getStatusChecksProtection({
      ...repoRef,
      branch,
    });

    const contexts = data.contexts ?? [];
    const checks = (data.checks ?? []).map((check) => check.context);
    const isRequired = contexts.includes(checkName) || checks.includes(checkName);

    return isRequired ? "required" : "not-required";
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 403 && status !== 404) {
      core.warning(
        `Could not determine whether "${checkName}" is a required status check: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    return "unknown";
  }
}

export function requiredStatusCheckNotice(
  state: RequiredStatusCheckState,
  checkName: string
): string | null {
  if (state === "required") return null;

  if (state === "not-required") {
    return (
      `ℹ️ This check ("${checkName}") is not configured as a required status check on this branch — ` +
      "it will not block the merge. See the README to enable real enforcement."
    );
  }

  return (
    `ℹ️ Could not confirm whether "${checkName}" is required on this branch — branch protection may not ` +
    "be available on this plan or repo visibility (e.g. a private repo on GitHub Free). Merges won't be " +
    "blocked unless a required status check is configured. See the README."
  );
}
