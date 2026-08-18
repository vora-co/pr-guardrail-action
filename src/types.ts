export interface PullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PullCommit {
  sha: string;
  message: string;
  authorDate: string;
  committerLogin?: string | null;
}

export type SignalId =
  | "co-authored-by-agent"
  | "risky-file"
  | "shell-command"
  | "volume-anomaly";

export interface SignalResult {
  id: SignalId;
  detected: boolean;
  details: string[];
}
