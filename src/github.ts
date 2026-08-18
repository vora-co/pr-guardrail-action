import * as core from "@actions/core";
import * as github from "@actions/github";
import { PullCommit, PullFile } from "./types";
import { Review } from "./humanGate";

export type Octokit = ReturnType<typeof github.getOctokit>;

export interface RepoRef {
  owner: string;
  repo: string;
}

export async function fetchPullFiles(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number
): Promise<PullFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    ...repoRef,
    pull_number: pullNumber,
    per_page: 100,
  });

  return files.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
  }));
}

export async function fetchPullCommits(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number
): Promise<PullCommit[]> {
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    ...repoRef,
    pull_number: pullNumber,
    per_page: 100,
  });

  return commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    authorDate: commit.commit.author?.date ?? commit.commit.committer?.date ?? "",
    committerLogin: commit.committer?.login,
  }));
}

export async function fetchPullReviews(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number
): Promise<Review[]> {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    ...repoRef,
    pull_number: pullNumber,
    per_page: 100,
  });

  return reviews
    .filter((review) => review.user && review.submitted_at)
    .map((review) => ({
      authorLogin: review.user!.login,
      state: review.state,
      submittedAt: review.submitted_at!,
    }));
}

export interface IssueCommentData {
  authorLogin: string;
  body: string;
  createdAt: string;
}

export async function fetchIssueComments(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number
): Promise<IssueCommentData[]> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...repoRef,
    issue_number: pullNumber,
    per_page: 100,
  });

  return comments
    .filter((comment) => comment.user)
    .map((comment) => ({
      authorLogin: comment.user!.login,
      body: comment.body ?? "",
      createdAt: comment.created_at,
    }));
}

export const CHECK_RUN_NAME = "vora-guardrail";

/**
 * Best-effort: on a fork PR, the default GITHUB_TOKEN is read-only and this
 * call fails with a permissions error. Callers must tolerate a null id and
 * keep going — a missing check run must never crash the whole run.
 */
export async function createCheckRun(
  octokit: Octokit,
  repoRef: RepoRef,
  headSha: string
): Promise<number | null> {
  try {
    const { data } = await octokit.rest.checks.create({
      ...repoRef,
      name: CHECK_RUN_NAME,
      head_sha: headSha,
      status: "in_progress",
    });
    return data.id;
  } catch (error) {
    core.warning(
      `Could not create the "${CHECK_RUN_NAME}" check run (likely a read-only token on a fork PR): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export async function completeCheckRun(
  octokit: Octokit,
  repoRef: RepoRef,
  checkRunId: number | null,
  conclusion: "success" | "failure",
  summary: string
): Promise<void> {
  if (checkRunId === null) return;

  try {
    await octokit.rest.checks.update({
      ...repoRef,
      check_run_id: checkRunId,
      status: "completed",
      conclusion,
      output: {
        title: conclusion === "success" ? "No blocking signals" : "Blocked — human review required",
        summary,
      },
    });
  } catch (error) {
    core.warning(
      `Could not complete the "${CHECK_RUN_NAME}" check run: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

const COMMENT_MARKER = "<!-- vora-guardrail-comment -->";

export async function upsertGuardrailComment(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number,
  body: string
): Promise<void> {
  const taggedBody = `${COMMENT_MARKER}\n${body}`;

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...repoRef,
    issue_number: pullNumber,
    per_page: 100,
  });

  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      ...repoRef,
      comment_id: existing.id,
      body: taggedBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      ...repoRef,
      issue_number: pullNumber,
      body: taggedBody,
    });
  }
}
