import { Review } from "./humanGate";

export interface IssueComment {
  authorLogin: string;
  body: string;
  createdAt: string;
}

export type AckRejectReason = "too-short" | "too-early";

export interface AckAttempt {
  createdAt: string;
  reason: AckRejectReason;
}

export interface SelfAckResult {
  satisfied: boolean;
  detail?: string;
  /** Every ack-shaped comment that didn't qualify, with why — used to explain a near-miss in the PR comment. */
  rejectedAttempts: AckAttempt[];
}

const ACK_PATTERN = /^\/guardrail-ack:\s*(.+?)\s*$/im;

/**
 * self-ack lets the PR author satisfy the human gate without a second
 * reviewer, but only through a deliberate `/guardrail-ack: <reason>` comment
 * — never through GitHub's native "Approve" (already excluded for the
 * author elsewhere) — and only once a cooldown has passed since their last
 * push, so the ack can't be indistinguishable from a reflexive click on the
 * same push that introduced the risk.
 */
export function evaluateSelfAck(
  authorLogin: string,
  comments: IssueComment[],
  lastPushAt: string,
  minLength: number,
  cooldownMinutes: number
): SelfAckResult {
  const lastPushTime = new Date(lastPushAt).getTime();
  const cooldownMs = cooldownMinutes * 60_000;
  const rejectedAttempts: AckAttempt[] = [];

  const candidates = comments
    .filter((comment) => comment.authorLogin === authorLogin)
    .map((comment) => ({ comment, match: comment.body.match(ACK_PATTERN) }))
    .filter(
      (entry): entry is { comment: IssueComment; match: RegExpMatchArray } =>
        entry.match !== null
    )
    .sort(
      (a, b) =>
        new Date(a.comment.createdAt).getTime() - new Date(b.comment.createdAt).getTime()
    );

  for (const { comment, match } of candidates) {
    const justification = match[1].trim();
    const commentTime = new Date(comment.createdAt).getTime();

    if (justification.length < minLength) {
      rejectedAttempts.push({ createdAt: comment.createdAt, reason: "too-short" });
      continue;
    }
    if (commentTime - lastPushTime < cooldownMs) {
      rejectedAttempts.push({ createdAt: comment.createdAt, reason: "too-early" });
      continue;
    }

    return {
      satisfied: true,
      detail: `Acknowledged by the author on ${comment.createdAt}: "${justification}"`,
      rejectedAttempts,
    };
  }

  return { satisfied: false, rejectedAttempts };
}

export interface SecondAgentResult {
  satisfied: boolean;
  detail?: string;
}

/**
 * second-agent is satisfied by an APPROVED review from a login explicitly
 * configured in `trustedReviewerAgents` — never autodetected or trusted by
 * default, so a second token for the same bot can't trivially forge this.
 * An empty allowlist means the mode can never be satisfied, by design.
 */
export function evaluateSecondAgent(
  authorLogin: string,
  reviews: Review[],
  trustedReviewerAgents: string[]
): SecondAgentResult {
  if (trustedReviewerAgents.length === 0) {
    return { satisfied: false };
  }

  const latestByReviewer = new Map<string, Review>();
  for (const review of reviews) {
    if (review.authorLogin === authorLogin) continue;
    if (!trustedReviewerAgents.includes(review.authorLogin)) continue;

    const current = latestByReviewer.get(review.authorLogin);
    if (!current || new Date(review.submittedAt) >= new Date(current.submittedAt)) {
      latestByReviewer.set(review.authorLogin, review);
    }
  }

  const approving = Array.from(latestByReviewer.entries()).find(
    ([, review]) => review.state === "APPROVED"
  );

  if (!approving) return { satisfied: false };

  return { satisfied: true, detail: `Approved by trusted reviewer agent "${approving[0]}".` };
}
