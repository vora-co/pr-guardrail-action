import { evaluateSecondAgent, evaluateSelfAck, IssueComment } from "../src/soloMaintainer";
import { Review } from "../src/humanGate";

function comment(authorLogin: string, body: string, createdAt: string): IssueComment {
  return { authorLogin, body, createdAt };
}

function review(authorLogin: string, state: string, submittedAt: string): Review {
  return { authorLogin, state, submittedAt };
}

const LAST_PUSH = "2026-08-11T10:00:00Z";

describe("evaluateSelfAck", () => {
  it("is satisfied by a sufficiently long ack posted after the cooldown", () => {
    const result = evaluateSelfAck(
      "alice",
      [
        comment(
          "alice",
          "/guardrail-ack: reviewed the migration myself, it only backfills a default value",
          "2026-08-11T10:20:00Z"
        ),
      ],
      LAST_PUSH,
      20,
      15
    );
    expect(result.satisfied).toBe(true);
    expect(result.detail).toContain("reviewed the migration myself");
  });

  it("rejects a justification shorter than the configured minimum", () => {
    const result = evaluateSelfAck(
      "alice",
      [comment("alice", "/guardrail-ack: ok fine", "2026-08-11T10:20:00Z")],
      LAST_PUSH,
      20,
      15
    );
    expect(result.satisfied).toBe(false);
    expect(result.rejectedAttempts).toEqual([
      { createdAt: "2026-08-11T10:20:00Z", reason: "too-short" },
    ]);
  });

  it("rejects an ack posted before the cooldown has elapsed", () => {
    const result = evaluateSelfAck(
      "alice",
      [
        comment(
          "alice",
          "/guardrail-ack: reviewed the migration myself, it only backfills a default value",
          "2026-08-11T10:01:00Z"
        ),
      ],
      LAST_PUSH,
      20,
      15
    );
    expect(result.satisfied).toBe(false);
    expect(result.rejectedAttempts).toEqual([
      { createdAt: "2026-08-11T10:01:00Z", reason: "too-early" },
    ]);
  });

  it("ignores ack comments from anyone other than the PR author", () => {
    const result = evaluateSelfAck(
      "alice",
      [
        comment(
          "bob",
          "/guardrail-ack: I reviewed this thoroughly and it looks fine to me",
          "2026-08-11T10:30:00Z"
        ),
      ],
      LAST_PUSH,
      20,
      15
    );
    expect(result.satisfied).toBe(false);
    expect(result.rejectedAttempts).toEqual([]);
  });

  it("ignores comments that don't match the ack pattern", () => {
    const result = evaluateSelfAck(
      "alice",
      [comment("alice", "looks good to me", "2026-08-11T10:30:00Z")],
      LAST_PUSH,
      20,
      15
    );
    expect(result.satisfied).toBe(false);
  });

  it("picks a later valid ack after an earlier rejected attempt", () => {
    const result = evaluateSelfAck(
      "alice",
      [
        comment("alice", "/guardrail-ack: too short", "2026-08-11T10:01:00Z"),
        comment(
          "alice",
          "/guardrail-ack: on reflection, reviewed the full diff and it's safe to merge",
          "2026-08-11T10:30:00Z"
        ),
      ],
      LAST_PUSH,
      20,
      15
    );
    expect(result.satisfied).toBe(true);
    expect(result.rejectedAttempts).toHaveLength(1);
  });
});

describe("evaluateSecondAgent", () => {
  it("is satisfied by an approval from a trusted reviewer agent", () => {
    const result = evaluateSecondAgent(
      "alice",
      [review("review-bot", "APPROVED", "2026-08-11T11:00:00Z")],
      ["review-bot"]
    );
    expect(result.satisfied).toBe(true);
    expect(result.detail).toContain("review-bot");
  });

  it("is never satisfied when trusted-reviewer-agents is empty, even if a reviewer approved", () => {
    const result = evaluateSecondAgent(
      "alice",
      [review("some-bot", "APPROVED", "2026-08-11T11:00:00Z")],
      []
    );
    expect(result.satisfied).toBe(false);
  });

  it("ignores an approval from a reviewer not on the allowlist", () => {
    const result = evaluateSecondAgent(
      "alice",
      [review("random-bot", "APPROVED", "2026-08-11T11:00:00Z")],
      ["review-bot"]
    );
    expect(result.satisfied).toBe(false);
  });

  it("does not count the PR author even if they are on the allowlist", () => {
    const result = evaluateSecondAgent(
      "alice",
      [review("alice", "APPROVED", "2026-08-11T11:00:00Z")],
      ["alice"]
    );
    expect(result.satisfied).toBe(false);
  });

  it("respects a revoked approval (latest state wins)", () => {
    const result = evaluateSecondAgent(
      "alice",
      [
        review("review-bot", "APPROVED", "2026-08-11T11:00:00Z"),
        review("review-bot", "CHANGES_REQUESTED", "2026-08-11T12:00:00Z"),
      ],
      ["review-bot"]
    );
    expect(result.satisfied).toBe(false);
  });
});
