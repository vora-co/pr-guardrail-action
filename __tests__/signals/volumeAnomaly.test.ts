import { detectVolumeAnomaly } from "../../src/signals/volumeAnomaly";
import { PullCommit, PullFile } from "../../src/types";

function file(changes: number): PullFile {
  return { filename: "f.ts", status: "modified", additions: changes, deletions: 0, changes };
}

function commit(sha: string, isoDate: string): PullCommit {
  return { sha, message: "msg", authorDate: isoDate };
}

describe("detectVolumeAnomaly", () => {
  it("flags a large diff landed within the time window", () => {
    const result = detectVolumeAnomaly(
      [file(500)],
      [commit("a", "2026-08-11T10:00:00Z"), commit("b", "2026-08-11T10:05:00Z")],
      300,
      10
    );
    expect(result.detected).toBe(true);
  });

  it("does not flag a large diff spread over a long time", () => {
    const result = detectVolumeAnomaly(
      [file(500)],
      [commit("a", "2026-08-11T10:00:00Z"), commit("b", "2026-08-12T10:00:00Z")],
      300,
      10
    );
    expect(result.detected).toBe(false);
  });

  it("does not flag a small diff even if fast", () => {
    const result = detectVolumeAnomaly(
      [file(10)],
      [commit("a", "2026-08-11T10:00:00Z"), commit("b", "2026-08-11T10:01:00Z")],
      300,
      10
    );
    expect(result.detected).toBe(false);
  });

  it("does not flag a PR with a single commit (no velocity to measure)", () => {
    const result = detectVolumeAnomaly(
      [file(500)],
      [commit("a", "2026-08-11T10:00:00Z")],
      300,
      10
    );
    expect(result.detected).toBe(false);
  });

  it("does not flag a PR with no commits yet", () => {
    const result = detectVolumeAnomaly([file(500)], [], 300, 10);
    expect(result.detected).toBe(false);
  });
});
