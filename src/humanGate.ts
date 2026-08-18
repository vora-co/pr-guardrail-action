export interface Review {
  authorLogin: string;
  /** GitHub review state, e.g. APPROVED, CHANGES_REQUESTED, DISMISSED, COMMENTED. */
  state: string;
  submittedAt: string;
}

/**
 * A human gate is valid only when someone OTHER than the PR author has an
 * APPROVED review as their most recent review state. GitHub keeps every
 * review in the list, including dismissed/superseded ones, so we must look
 * at each reviewer's latest submission — an approval followed by a
 * "Request changes" or a dismissal must revoke the gate.
 */
export function hasValidHumanApproval(prAuthorLogin: string, reviews: Review[]): boolean {
  const latestByReviewer = new Map<string, Review>();

  for (const review of reviews) {
    if (review.authorLogin === prAuthorLogin) continue;

    const current = latestByReviewer.get(review.authorLogin);
    if (!current || new Date(review.submittedAt) >= new Date(current.submittedAt)) {
      latestByReviewer.set(review.authorLogin, review);
    }
  }

  return Array.from(latestByReviewer.values()).some(
    (review) => review.state === "APPROVED"
  );
}

export function isAllowlistedBot(authorLogin: string, botAllowlist: string[]): boolean {
  return botAllowlist.includes(authorLogin);
}
