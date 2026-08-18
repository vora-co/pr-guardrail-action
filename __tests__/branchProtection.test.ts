import { detectRequiredStatusCheck, requiredStatusCheckNotice } from "../src/branchProtection";

const repoRef = { owner: "vora-co", repo: "pr-guardrail-action" };
const CHECK_NAME = "vora-guardrail";

function makeOctokit(getStatusChecksProtection: () => Promise<unknown>) {
  return {
    rest: { repos: { getStatusChecksProtection } },
  } as any;
}

describe("detectRequiredStatusCheck", () => {
  it("returns 'required' when the check is listed as required (200, configured)", async () => {
    const octokit = makeOctokit(() =>
      Promise.resolve({ data: { contexts: [CHECK_NAME], checks: [] } })
    );
    const state = await detectRequiredStatusCheck(octokit, repoRef, "main", CHECK_NAME);
    expect(state).toBe("required");
  });

  it("returns 'required' when found in the newer `checks` array shape", async () => {
    const octokit = makeOctokit(() =>
      Promise.resolve({ data: { contexts: [], checks: [{ context: CHECK_NAME, app_id: null }] } })
    );
    const state = await detectRequiredStatusCheck(octokit, repoRef, "main", CHECK_NAME);
    expect(state).toBe("required");
  });

  it("returns 'not-required' when branch protection exists but doesn't list this check (200, not configured)", async () => {
    const octokit = makeOctokit(() =>
      Promise.resolve({ data: { contexts: ["some-other-check"], checks: [] } })
    );
    const state = await detectRequiredStatusCheck(octokit, repoRef, "main", CHECK_NAME);
    expect(state).toBe("not-required");
  });

  it("returns 'unknown' on a 404 (no branch protection / plan doesn't support it), without throwing", async () => {
    const octokit = makeOctokit(() => Promise.reject({ status: 404 }));
    await expect(
      detectRequiredStatusCheck(octokit, repoRef, "main", CHECK_NAME)
    ).resolves.toBe("unknown");
  });

  it("returns 'unknown' on a 403 (private repo on a plan without this feature), without throwing", async () => {
    const octokit = makeOctokit(() => Promise.reject({ status: 403 }));
    await expect(
      detectRequiredStatusCheck(octokit, repoRef, "main", CHECK_NAME)
    ).resolves.toBe("unknown");
  });

  it("returns 'unknown' on an unexpected error too, without throwing", async () => {
    const octokit = makeOctokit(() => Promise.reject(new Error("boom")));
    await expect(
      detectRequiredStatusCheck(octokit, repoRef, "main", CHECK_NAME)
    ).resolves.toBe("unknown");
  });
});

describe("requiredStatusCheckNotice", () => {
  it("returns null when required (no notice needed)", () => {
    expect(requiredStatusCheckNotice("required", CHECK_NAME)).toBeNull();
  });

  it("explains the check won't block merges when not required", () => {
    const notice = requiredStatusCheckNotice("not-required", CHECK_NAME);
    expect(notice).toContain("not configured as a required status check");
    expect(notice).toContain(CHECK_NAME);
  });

  it("explains the plan/visibility limitation when unknown", () => {
    const notice = requiredStatusCheckNotice("unknown", CHECK_NAME);
    expect(notice).toContain("Could not confirm");
    expect(notice).toContain("GitHub Free");
  });
});
