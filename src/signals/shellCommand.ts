import { minimatch } from "minimatch";
import { PullFile, SignalResult } from "../types";

const SHELL_CALL_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "subprocess", pattern: /\bsubprocess\b/i },
  { label: "os.system", pattern: /\bos\.system\s*\(/i },
  { label: "child_process", pattern: /\bchild_process\b/i },
  { label: "exec()", pattern: /\bexec(?:Sync)?\s*\(/i },
];

const WORKFLOW_FILE_PATTERN = "**/.github/workflows/*.{yml,yaml}";
const WORKFLOW_RUN_PATTERN = /^\s*(?:-\s*)?run:\s*\S/;

function addedLines(patch: string): string[] {
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

export function detectShellCommand(files: PullFile[]): SignalResult {
  const details: string[] = [];

  for (const file of files) {
    if (!file.patch) continue;

    const isWorkflowFile = minimatch(file.filename, WORKFLOW_FILE_PATTERN, {
      dot: true,
      nocase: true,
    });

    for (const line of addedLines(file.patch)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      const callMatch = SHELL_CALL_PATTERNS.find(({ pattern }) => pattern.test(line));
      if (callMatch) {
        details.push(`${file.filename}: ${callMatch.label} — "${trimmed}"`);
        continue;
      }

      if (isWorkflowFile && WORKFLOW_RUN_PATTERN.test(line)) {
        details.push(`${file.filename}: CI run block — "${trimmed}"`);
      }
    }
  }

  return {
    id: "shell-command",
    detected: details.length > 0,
    details,
  };
}
