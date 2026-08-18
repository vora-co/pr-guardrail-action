import { loadConfig } from "../src/config";

function setInputs(inputs: Record<string, string>): void {
  for (const key of [
    "bot-allowlist",
    "risky-file-patterns",
    "volume-threshold",
    "time-window",
    "mode",
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
});
