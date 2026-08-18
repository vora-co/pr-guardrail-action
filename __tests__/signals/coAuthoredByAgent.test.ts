import { detectCoAuthoredByAgent } from "../../src/signals/coAuthoredByAgent";
import { PullCommit } from "../../src/types";

function commit(sha: string, message: string): PullCommit {
  return { sha, message, authorDate: "2026-08-11T00:00:00Z" };
}

describe("detectCoAuthoredByAgent", () => {
  it("detects a known AI tool trailer", () => {
    const result = detectCoAuthoredByAgent([
      commit(
        "abc1234",
        "Fix login bug\n\nCo-authored-by: Claude <noreply@anthropic.com>"
      ),
    ]);
    expect(result.detected).toBe(true);
    expect(result.details).toHaveLength(1);
  });

  it("detects multiple trailers across multiple commits", () => {
    const result = detectCoAuthoredByAgent([
      commit("a", "msg\n\nCo-authored-by: Claude <noreply@anthropic.com>"),
      commit(
        "b",
        "msg\n\nCo-authored-by: Copilot <175728472+copilot@users.noreply.github.com>"
      ),
    ]);
    expect(result.detected).toBe(true);
    expect(result.details).toHaveLength(2);
  });

  it("does not trigger on a commit with no trailer", () => {
    const result = detectCoAuthoredByAgent([commit("a", "Just a normal commit")]);
    expect(result.detected).toBe(false);
    expect(result.details).toHaveLength(0);
  });

  it("does not trigger on a real person who happens to share a name with a known tool", () => {
    const result = detectCoAuthoredByAgent([
      commit(
        "a",
        "Fix bug\n\nCo-authored-by: Claude Martinez <claude.martinez@example.com>"
      ),
    ]);
    expect(result.detected).toBe(false);
  });

  it("is case-insensitive on name and email", () => {
    const result = detectCoAuthoredByAgent([
      commit("a", "msg\n\nco-authored-by: CLAUDE <NOREPLY@ANTHROPIC.COM>"),
    ]);
    expect(result.detected).toBe(true);
  });

  it("does not trigger on an unrelated regular co-author", () => {
    const result = detectCoAuthoredByAgent([
      commit("a", "msg\n\nCo-authored-by: Jane Doe <jane@example.com>"),
    ]);
    expect(result.detected).toBe(false);
  });
});
