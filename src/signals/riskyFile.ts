import { minimatch } from "minimatch";
import { PullFile, SignalResult } from "../types";

/**
 * Built-in high-risk patterns: DB migrations, IaC, permission and secret
 * configs. Applies to human and AI-authored changes alike — the file's
 * intrinsic risk is what matters, not who wrote it.
 */
export const DEFAULT_RISKY_FILE_PATTERNS: ReadonlyArray<string> = [
  "**/migrations/**",
  "**/migrate/**",
  "**/*.migration.*",
  "**/db/migrate/**",
  "**/*.tf",
  "**/*.tfvars",
  "**/cdk.out/**",
  "**/*.cdk.ts",
  "**/cloudformation/**",
  "**/*.cloudformation.yml",
  "**/*.cloudformation.yaml",
  "**/CODEOWNERS",
  "**/.github/CODEOWNERS",
  "**/.github/workflows/**",
  "**/*.pem",
  "**/*.key",
  "**/secrets.*",
  "**/*secret*.yml",
  "**/*secret*.yaml",
  "**/*secret*.json",
  "**/.env",
  "**/.env.*",
];

export function detectRiskyFile(
  files: PullFile[],
  extraPatterns: string[] = []
): SignalResult {
  const patterns = [...DEFAULT_RISKY_FILE_PATTERNS, ...extraPatterns];
  const details: string[] = [];

  for (const file of files) {
    const matchedPattern = patterns.find((pattern) =>
      minimatch(file.filename, pattern, { dot: true, nocase: true })
    );
    if (matchedPattern) {
      details.push(`${file.filename} (matches "${matchedPattern}")`);
    }
  }

  return {
    id: "risky-file",
    detected: details.length > 0,
    details,
  };
}
