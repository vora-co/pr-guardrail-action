import * as core from "@actions/core";

export type Mode = "block" | "warn";
export type SoloMaintainerMode = "off" | "self-ack" | "second-agent";

export interface GuardrailConfig {
  botAllowlist: string[];
  riskyFilePatterns: string[];
  volumeThreshold: number;
  timeWindowMinutes: number;
  mode: Mode;
  soloMaintainerMode: SoloMaintainerMode;
  selfAckMinLength: number;
  selfAckCooldownMinutes: number;
  trustedReviewerAgents: string[];
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

  const soloMaintainerMode = core.getInput("solo-maintainer-mode") || "off";
  if (!["off", "self-ack", "second-agent"].includes(soloMaintainerMode)) {
    throw new Error(
      `Invalid input "solo-maintainer-mode": expected "off", "self-ack", or "second-agent", ` +
        `got "${soloMaintainerMode}".`
    );
  }

  const selfAckMinLength = parsePositiveInt(
    "self-ack-min-length",
    core.getInput("self-ack-min-length") || "20"
  );
  const selfAckCooldownMinutes = parsePositiveInt(
    "self-ack-cooldown-minutes",
    core.getInput("self-ack-cooldown-minutes") || "15"
  );
  const trustedReviewerAgents = parseCsv(core.getInput("trusted-reviewer-agents"));

  if (soloMaintainerMode === "second-agent" && trustedReviewerAgents.length === 0) {
    core.warning(
      'solo-maintainer-mode is "second-agent" but "trusted-reviewer-agents" is empty — ' +
        "the gate can never be satisfied this way until you configure at least one trusted reviewer login."
    );
  }

  return {
    botAllowlist,
    riskyFilePatterns,
    volumeThreshold,
    timeWindowMinutes,
    mode,
    soloMaintainerMode: soloMaintainerMode as SoloMaintainerMode,
    selfAckMinLength,
    selfAckCooldownMinutes,
    trustedReviewerAgents,
  };
}
