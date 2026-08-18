import { runGuardrail } from "../src/orchestrate";
import { GuardrailConfig } from "../src/config";

function baseConfig(overrides: Partial<GuardrailConfig> = {}): GuardrailConfig {
  return {
    botAllowlist: ["dependabot[bot]"],
    riskyFilePatterns: [],
    volumeThreshold: 300,
    timeWindowMinutes: 10,
    mode: "block",
    soloMaintainerMode: "off",
    selfAckMinLength: 20,
    selfAckCooldownMinutes: 15,
    trustedReviewerAgents: [],
    ...overrides,
  };
}

function makeOctokit(overrides: {
  files?: any[];
  commits?: any[];
  reviews?: any[];
  comments?: any[];
  createCheckShouldFail?: boolean;
  commentShouldFail?: boolean;
}) {
  const {
    files = [],
    commits = [],
    reviews = [],
    comments = [],
    createCheckShouldFail = false,
    commentShouldFail = false,
  } = overrides;

  const updateComment = jest.fn().mockResolvedValue({});
  const createComment = jest.fn().mockImplementation(() => {
    if (commentShouldFail) return Promise.reject(new Error("Resource not accessible by integration"));
    return Promise.resolve({});
  });

  const checksCreate = jest.fn().mockImplementation(() => {
    if (createCheckShouldFail) return Promise.reject(new Error("Resource not accessible by integration"));
    return Promise.resolve({ data: { id: 42 } });
  });
  const checksUpdate = jest.fn().mockResolvedValue({});

  const paginate = jest.fn().mockImplementation((fn: unknown) => {
    if (fn === octokit.rest.pulls.listFiles) return Promise.resolve(files);
    if (fn === octokit.rest.pulls.listCommits) return Promise.resolve(commits);
    if (fn === octokit.rest.pulls.listReviews) return Promise.resolve(reviews);
    if (fn === octokit.rest.issues.listComments) return Promise.resolve(comments);
    return Promise.resolve([]);
  });

  const octokit: any = {
    paginate,
    rest: {
      pulls: {
        listFiles: jest.fn(),
        listCommits: jest.fn(),
        listReviews: jest.fn(),
      },
      issues: {
        listComments: jest.fn(),
        createComment,
        updateComment,
      },
      checks: {
        create: checksCreate,
        update: checksUpdate,
      },
    },
  };

  return { octokit, checksCreate, checksUpdate, createComment, updateComment };
}

const repoRef = { owner: "vora-co", repo: "pr-guardrail-action" };

describe("runGuardrail", () => {
  it("skips analysis entirely for an allowlisted bot author", async () => {
    const { octokit, checksCreate } = makeOctokit({});
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "dependabot[bot]",
      config: baseConfig(),
    });
    expect(result.outcome).toBe("skipped-bot");
    expect(checksCreate).not.toHaveBeenCalled();
  });

  it("stays pending without asserting a result when no commits are synced yet", async () => {
    const { octokit, checksUpdate } = makeOctokit({ files: [], commits: [] });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig(),
    });
    expect(result.outcome).toBe("pending-no-commits");
    expect(checksUpdate).not.toHaveBeenCalled();
  });

  it("evaluates signals and completes the check run as failure when blocking", async () => {
    const { octokit, checksUpdate } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig(),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("failure");
    }
    expect(checksUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ conclusion: "failure", check_run_id: 42 })
    );
  });

  it("does not crash the check run when posting the PR comment fails (read-only fork token)", async () => {
    const { octokit, checksUpdate } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [],
      commentShouldFail: true,
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig(),
    });
    expect(result.outcome).toBe("evaluated");
    expect(checksUpdate).toHaveBeenCalled();
  });

  it("does not crash when the check run itself cannot be created (read-only fork token)", async () => {
    const { octokit, checksUpdate } = makeOctokit({
      files: [],
      commits: [{ sha: "a", commit: { message: "msg", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [],
      createCheckShouldFail: true,
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig(),
    });
    expect(result.outcome).toBe("evaluated");
    expect(checksUpdate).not.toHaveBeenCalled();
  });

  it("off mode ignores a /guardrail-ack comment entirely (unchanged behavior)", async () => {
    const { octokit } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [],
      comments: [
        {
          user: { login: "alice" },
          body: "/guardrail-ack: reviewed this migration myself, it's a safe backfill",
          created_at: "2026-08-11T10:30:00Z",
        },
      ],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig({ soloMaintainerMode: "off" }),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("failure");
      expect(result.decision.gateVia).toBe("none");
    }
  });

  it("self-ack mode satisfies the gate with a valid ack comment from the author", async () => {
    const { octokit } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [],
      comments: [
        {
          user: { login: "alice" },
          body: "/guardrail-ack: reviewed this migration myself, it's a safe backfill",
          created_at: "2026-08-11T10:30:00Z",
        },
      ],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig({ soloMaintainerMode: "self-ack" }),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("success");
      expect(result.decision.gateVia).toBe("self-ack");
    }
  });

  it("self-ack mode still blocks when the ack is posted before the cooldown elapses", async () => {
    const { octokit } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [],
      comments: [
        {
          user: { login: "alice" },
          body: "/guardrail-ack: reviewed this migration myself, it's a safe backfill",
          created_at: "2026-08-11T10:01:00Z",
        },
      ],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig({ soloMaintainerMode: "self-ack" }),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("failure");
      expect(result.decision.gateVia).toBe("none");
    }
  });

  it("second-agent mode satisfies the gate via an approval from a trusted reviewer login", async () => {
    const { octokit } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [{ user: { login: "review-bot" }, state: "APPROVED", submitted_at: "2026-08-11T11:00:00Z" }],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig({ soloMaintainerMode: "second-agent", trustedReviewerAgents: ["review-bot"] }),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("success");
      expect(result.decision.gateVia).toBe("second-agent");
    }
  });

  it("second-agent mode never trusts an approval when trusted-reviewer-agents is empty", async () => {
    const { octokit } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [{ user: { login: "review-bot" }, state: "APPROVED", submitted_at: "2026-08-11T11:00:00Z" }],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig({ soloMaintainerMode: "second-agent", trustedReviewerAgents: [] }),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("failure");
      expect(result.decision.gateVia).toBe("none");
    }
  });

  it("succeeds when a blocking signal fires but a non-author reviewer approved", async () => {
    const { octokit } = makeOctokit({
      files: [{ filename: "infra/main.tf", status: "added", additions: 5, deletions: 0, changes: 5 }],
      commits: [{ sha: "a", commit: { message: "add tf", author: { date: "2026-08-11T10:00:00Z" } } }],
      reviews: [{ user: { login: "bob" }, state: "APPROVED", submitted_at: "2026-08-11T11:00:00Z" }],
    });
    const result = await runGuardrail({
      octokit,
      repoRef,
      pullNumber: 1,
      headSha: "sha",
      authorLogin: "alice",
      config: baseConfig(),
    });
    expect(result.outcome).toBe("evaluated");
    if (result.outcome === "evaluated") {
      expect(result.decision.conclusion).toBe("success");
    }
  });
});
