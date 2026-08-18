import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config";

async function run(): Promise<void> {
  try {
    const config = loadConfig();
    const context = github.context;

    core.info(`PR Guardrail running in "${config.mode}" mode.`);
    core.info(`Event: ${context.eventName}`);

    // Signal detection, blocking logic, human-gate checks and PR comments
    // are added in later stages — this is the scaffold entrypoint.
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
