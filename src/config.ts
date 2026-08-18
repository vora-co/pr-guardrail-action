import * as core from "@actions/core";

export type Mode = "block" | "warn";

export interface GuardrailConfig {
  botAllowlist: string[];
  riskyFilePatterns: string[];
  volumeThreshold: number;
  timeWindowMinutes: number;
  mode: Mode;
}

const DEFAULT_BOT_ALLOWLIST = [
  "dependabot[bot]",
  "renovate[bot]",
  "github-actions[bot]",
];

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveInt(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid input "${name}": expected a positive integer, got "${raw}".`
    );
  }
  return value;
}

export function loadConfig(): GuardrailConfig {
  const mode = core.getInput("mode") || "block";
  if (mode !== "block" && mode !== "warn") {
    throw new Error(`Invalid input "mode": expected "block" or "warn", got "${mode}".`);
  }

  const botAllowlist = [
    ...DEFAULT_BOT_ALLOWLIST,
    ...parseCsv(core.getInput("bot-allowlist")),
  ];

  const riskyFilePatterns = parseCsv(core.getInput("risky-file-patterns"));

  const volumeThreshold = parsePositiveInt(
    "volume-threshold",
    core.getInput("volume-threshold") || "300"
  );
  const timeWindowMinutes = parsePositiveInt(
    "time-window",
    core.getInput("time-window") || "10"
  );

  return {
    botAllowlist,
    riskyFilePatterns,
    volumeThreshold,
    timeWindowMinutes,
    mode,
  };
}
