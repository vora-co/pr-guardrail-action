import { PullCommit, PullFile, SignalResult } from "../types";

/**
 * Flags PRs where a large volume of changes landed in a short time window
 * between commits — a proxy for "big change, little visibility." This
 * signal alone never blocks a PR; it only combines with
 * co-authored-by-agent (see the two-level blocking rule).
 */
export function detectVolumeAnomaly(
  files: PullFile[],
  commits: PullCommit[],
  volumeThreshold: number,
  timeWindowMinutes: number
): SignalResult {
  const totalChanges = files.reduce((sum, file) => sum + file.changes, 0);

  if (commits.length < 2) {
    return { id: "volume-anomaly", detected: false, details: [] };
  }

  const timestamps = commits
    .map((commit) => new Date(commit.authorDate).getTime())
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) {
    return { id: "volume-anomaly", detected: false, details: [] };
  }

  const elapsedMs = timestamps[timestamps.length - 1] - timestamps[0];
  const elapsedMinutes = Math.max(elapsedMs / 60000, 0);

  const withinWindow = elapsedMinutes <= timeWindowMinutes;
  const overThreshold = totalChanges >= volumeThreshold;
  const detected = withinWindow && overThreshold;

  const details = detected
    ? [
        `${totalChanges} lines changed across ${commits.length} commits in ` +
          `${elapsedMinutes.toFixed(1)} min (threshold: ${volumeThreshold} lines / ` +
          `${timeWindowMinutes} min)`,
      ]
    : [];

  return { id: "volume-anomaly", detected, details };
}
