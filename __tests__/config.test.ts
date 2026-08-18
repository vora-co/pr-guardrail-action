import { loadConfig } from "../src/config";

function setInputs(inputs: Record<string, string>): void {
  for (const key of [
    "bot-allowlist",
    "risky-file-patterns",
    "volume-threshold",
    "time-window",
    "mode",
    "solo-maintainer-mode",
    "self-ack-min-length",
    "self-ack-cooldown-minutes",
    "trusted-reviewer-agents",
  ]) {
    delete process.env[`INPUT_${key.toUpperCase()}`];
  }
  for (const [key, value] of Object.entries(inputs)) {
    process.env[`INPUT_${key.toUpperCase()}`] = value;
  }
}

describe("loadConfig", () => {
  it("applies reasonable defaults when no inputs are set", () => {
    setInputs({});
    const config = loadConfig();
    expect(config.mode).toBe("block");
    expect(config.volumeThreshold).toBe(300);
    expect(config.timeWindowMinutes).toBe(10);
    expect(config.botAllowlist).toEqual(
      expect.arrayContaining([
        "dependabot[bot]",
        "renovate[bot]",
        "github-actions[bot]",
      ])
    );
    expect(config.riskyFilePatterns).toEqual([]);
    expect(config.soloMaintainerMode).toBe("off");
    expect(config.selfAckMinLength).toBe(20);
    expect(config.selfAckCooldownMinutes).toBe(15);
    expect(config.trustedReviewerAgents).toEqual([]);
  });

  it("merges custom bot-allowlist with the built-in defaults", () => {
    setInputs({ "bot-allowlist": "my-bot[bot], other-bot" });
    const config = loadConfig();
    expect(config.botAllowlist).toEqual(
      expect.arrayContaining([
        "dependabot[bot]",
        "my-bot[bot]",
        "other-bot",
      ])
    );
  });

  it("rejects an invalid mode", () => {
    setInputs({ mode: "delete" });
    expect(() => loadConfig()).toThrow(/mode/i);
  });

  it("rejects a zero or negative volume-threshold", () => {
    setInputs({ "volume-threshold": "0" });
    expect(() => loadConfig()).toThrow(/volume-threshold/i);

    setInputs({ "volume-threshold": "-5" });
    expect(() => loadConfig()).toThrow(/volume-threshold/i);
  });

  it("rejects a non-numeric time-window", () => {
    setInputs({ "time-window": "soon" });
    expect(() => loadConfig()).toThrow(/time-window/i);
  });

  it("rejects an invalid solo-maintainer-mode", () => {
    setInputs({ "solo-maintainer-mode": "yolo" });
    expect(() => loadConfig()).toThrow(/solo-maintainer-mode/i);
  });

  it("accepts self-ack and second-agent as valid solo-maintainer-mode values", () => {
    setInputs({ "solo-maintainer-mode": "self-ack" });
    expect(loadConfig().soloMaintainerMode).toBe("self-ack");

    setInputs({ "solo-maintainer-mode": "second-agent" });
    expect(loadConfig().soloMaintainerMode).toBe("second-agent");
  });

  it("rejects a zero or negative self-ack-min-length", () => {
    setInputs({ "self-ack-min-length": "0" });
    expect(() => loadConfig()).toThrow(/self-ack-min-length/i);
  });

  it("rejects a zero or negative self-ack-cooldown-minutes", () => {
    setInputs({ "self-ack-cooldown-minutes": "-1" });
    expect(() => loadConfig()).toThrow(/self-ack-cooldown-minutes/i);
  });

  it("parses trusted-reviewer-agents as a comma-separated list", () => {
    setInputs({ "trusted-reviewer-agents": "review-bot-a, review-bot-b" });
    expect(loadConfig().trustedReviewerAgents).toEqual(["review-bot-a", "review-bot-b"]);
  });
});
