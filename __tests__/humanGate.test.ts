import { hasValidHumanApproval, isAllowlistedBot } from "../src/humanGate";
import { Review } from "../src/humanGate";

function review(authorLogin: string, state: string, submittedAt: string): Review {
  return { authorLogin, state, submittedAt };
}

describe("hasValidHumanApproval", () => {
  it("is valid when a non-author reviewer approved", () => {
    const result = hasValidHumanApproval("alice", [
      review("bob", "APPROVED", "2026-08-11T10:00:00Z"),
    ]);
    expect(result).toBe(true);
  });

  it("ignores the author's own approval (self-approval doesn't count)", () => {
    const result = hasValidHumanApproval("alice", [
      review("alice", "APPROVED", "2026-08-11T10:00:00Z"),
    ]);
    expect(result).toBe(false);
  });

  it("still requires a non-author approval when the author also approved", () => {
    const result = hasValidHumanApproval("alice", [
      review("alice", "APPROVED", "2026-08-11T10:00:00Z"),
      review("bob", "CHANGES_REQUESTED", "2026-08-11T11:00:00Z"),
    ]);
    expect(result).toBe(false);
  });

  it("is invalid when approval was later revoked via Request changes", () => {
    const result = hasValidHumanApproval("alice", [
      review("bob", "APPROVED", "2026-08-11T10:00:00Z"),
      review("bob", "CHANGES_REQUESTED", "2026-08-11T11:00:00Z"),
    ]);
    expect(result).toBe(false);
  });

  it("is invalid when the approval was dismissed", () => {
    const result = hasValidHumanApproval("alice", [
      review("bob", "APPROVED", "2026-08-11T10:00:00Z"),
      review("bob", "DISMISSED", "2026-08-11T11:00:00Z"),
    ]);
    expect(result).toBe(false);
  });

  it("is valid when re-approved after a revocation", () => {
    const result = hasValidHumanApproval("alice", [
      review("bob", "APPROVED", "2026-08-11T10:00:00Z"),
      review("bob", "CHANGES_REQUESTED", "2026-08-11T11:00:00Z"),
      review("bob", "APPROVED", "2026-08-11T12:00:00Z"),
    ]);
    expect(result).toBe(true);
  });

  it("is valid if at least one of several reviewers has a current approval", () => {
    const result = hasValidHumanApproval("alice", [
      review("bob", "CHANGES_REQUESTED", "2026-08-11T10:00:00Z"),
      review("carol", "APPROVED", "2026-08-11T10:05:00Z"),
    ]);
    expect(result).toBe(true);
  });

  it("is invalid with no reviews at all", () => {
    expect(hasValidHumanApproval("alice", [])).toBe(false);
  });
});

describe("isAllowlistedBot", () => {
  it("returns true for an allowlisted author", () => {
    expect(isAllowlistedBot("dependabot[bot]", ["dependabot[bot]"])).toBe(true);
  });

  it("returns false for a non-allowlisted author", () => {
    expect(isAllowlistedBot("some-random-bot", ["dependabot[bot]"])).toBe(false);
  });
});
