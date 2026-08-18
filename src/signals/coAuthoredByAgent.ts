import { PullCommit, SignalResult } from "../types";

/**
 * Exact (name, email) pairs used by known AI coding tools in their
 * `Co-authored-by` trailers. Matched exactly (case-insensitive) rather than
 * by substring, so a real person named e.g. "Claude" with their own email
 * doesn't trigger a false positive. Extend this list as new tools emerge.
 */
const KNOWN_AI_COAUTHORS: ReadonlyArray<{ name: string; email: string }> = [
  { name: "claude", email: "noreply@anthropic.com" },
  { name: "claude", email: "claude@anthropic.com" },
  { name: "copilot", email: "175728472+copilot@users.noreply.github.com" },
  { name: "github copilot", email: "175728472+copilot@users.noreply.github.com" },
  { name: "cursor", email: "cursoragent@cursor.com" },
  { name: "cursor agent", email: "cursoragent@cursor.com" },
  { name: "devin ai", email: "devin-ai-integration[bot]@users.noreply.github.com" },
  { name: "chatgpt", email: "noreply@openai.com" },
  { name: "codex", email: "noreply@openai.com" },
];

const TRAILER_PATTERN = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim;

function isKnownAiCoauthor(name: string, email: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  return KNOWN_AI_COAUTHORS.some(
    (entry) => entry.name === normalizedName && entry.email === normalizedEmail
  );
}

export function detectCoAuthoredByAgent(commits: PullCommit[]): SignalResult {
  const details: string[] = [];

  for (const commit of commits) {
    for (const match of commit.message.matchAll(TRAILER_PATTERN)) {
      const [, name, email] = match;
      if (isKnownAiCoauthor(name, email)) {
        details.push(`${commit.sha.slice(0, 7)}: Co-authored-by: ${name} <${email}>`);
      }
    }
  }

  return {
    id: "co-authored-by-agent",
    detected: details.length > 0,
    details,
  };
}
