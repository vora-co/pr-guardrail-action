# PR Guardrail

A GitHub Action that gates risky pull requests behind an explicit human review — before they merge, not after.

Most code today is written with AI assistance, and that's not the problem this project is trying to solve. The problem is that changes touching infrastructure, data, permissions, or that run system commands can merge without anyone in particular having looked at them closely, whether a human or an agent wrote them. PR Guardrail detects that class of risky change and requires a **named human reviewer, not the author, to explicitly approve it** before the check turns green.

It runs entirely inside the GitHub Actions runner: no external service, no API keys, no code leaving your infrastructure, no LLM in the loop.

## What it is not

- **Not an "is this AI-written?" detector.** It doesn't try to prove authorship or block PRs just because a coding assistant was involved.
- **Not a brake on building with AI.** The default rules are designed so that ordinary AI-assisted work flows through untouched — gating triggers on the *intrinsic risk of the change*, not on the presence of an agent.
- **Not a SAST tool.** It doesn't analyze code for bugs or vulnerabilities — see [Detection signals](#detection-signals) for exactly what it looks at.

## How it decides

Four signals are evaluated on every PR, but they don't all carry the same weight:

| Signal | Blocks on its own? |
|---|---|
| `risky-file` — diff touches a high-risk file (DB migrations, IaC, permission/secret configs) | ✅ Yes |
| `shell-command` — diff adds a shell/process-execution call, or a `run:` step in a CI workflow | ✅ Yes |
| `co-authored-by-agent` — commit carries a `Co-authored-by` trailer from a known AI tool | ❌ No — reported only |
| `volume-anomaly` — large diff landed in a short time between commits | ⚠️ Only combined with `co-authored-by-agent` |

The reasoning: the mere presence of an AI co-author is not, by itself, risk — that's just how most software gets written now. What matters is *what* changed (a risky file, a shell command) or the combination of *how much* changed *with how little visibility* (a large AI-generated diff nobody had eyes on). See [`src/blocking.ts`](src/blocking.ts) for the exact rule.

## Detection signals

1. **`co-authored-by-agent`** — matches `Co-authored-by` trailers against an exact list of known AI tool identifiers (name + email pair), not a generic substring — so a real person who happens to be named "Claude" won't trigger a false positive.
2. **`risky-file`** — flags diffs touching DB migrations, Terraform/CDK/CloudFormation, `CODEOWNERS`, CI workflow files, or secret/env configs. Applies to human-authored changes too, since the risk lives in the file, not the author.
3. **`shell-command`** — flags added lines calling `subprocess`, `os.system`, `child_process`, or `exec(...)`, plus added `run:` steps in `.github/workflows/*.yml`.
4. **`volume-anomaly`** — flags a lines-changed-per-time-between-commits ratio above a configurable threshold.

## Human gate rules

- The PR **author cannot approve their own PR** as the human gate — that approval is ignored.
- If an approval is later revoked (`Request changes` or a dismissed review), the check goes back to `failure`.
- Authors on the `bot-allowlist` (e.g. `dependabot[bot]`, `renovate[bot]`, `github-actions[bot]` by default) skip analysis entirely.

### Solo-maintainer mode

The rules above assume a second human is available to review. If you're a solo maintainer or a 2-3 person team, that's not always true — and if your repo is private on GitHub Free, you also can't enable a required status check at all (see [Does this actually block anything?](#does-this-actually-block-anything) below). `solo-maintainer-mode` is opt-in and **off by default**; turning it on trades some rigor for something that's actually usable when there's no second reviewer.

| `solo-maintainer-mode` | Behavior |
|---|---|
| `off` (default) | Unchanged — a human other than the author must approve via GitHub's native review. |
| `self-ack` | The author can satisfy the gate by commenting `/guardrail-ack: <reason>` — **not** by clicking GitHub's native "Approve" (that's still ignored for the author). The justification must be at least `self-ack-min-length` characters and posted at least `self-ack-cooldown-minutes` after the PR's last commit, so it can't be a reflexive click on the same push that introduced the risk. |
| `second-agent` | **Replaces** the normal "any non-author approval counts" check with a stricter one: only an approving review from a login explicitly listed in `trusted-reviewer-agents` satisfies the gate. This is meant for a second review agent running under its own GitHub identity, distinct from whatever generated the change. The allowlist is never autodetected — you must configure it — so it can't be trivially forged with a second token for the same bot. Because it's a full replacement, an approval from anyone *not* on the list no longer counts while this mode is on. |

Whichever mode satisfies the gate, the check summary and PR comment say so explicitly — a self-ack or second-agent approval is never presented as if it were independent human review:

> ⚠️ Gate satisfied via **self-ack** (solo-maintainer-mode) — not independent human review.

## Installation

```yaml
name: PR Guardrail
on:
  pull_request:
    types: [opened, synchronize, reopened]
  pull_request_review:
    types: [submitted]

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  guardrail:
    runs-on: ubuntu-latest
    steps:
      - uses: vora-co/pr-guardrail-action@main
```

See [`examples/basic.yml`](examples/basic.yml).

### ⚠️ Required status check — this part is not optional

The Action runs and reports on every PR regardless of your branch protection settings — that's on purpose, so you get visibility even before you enforce anything. But **without a required status check, nothing actually blocks a merge.** After your first run, go to your repository's branch protection rules and add **`vora-guardrail`** as a required status check on your target branch. Until you do that, PR Guardrail is observability, not enforcement.

## Configuration

All inputs are optional with reasonable defaults.

| Input | Default | Description |
|---|---|---|
| `mode` | `block` | `block` fails the check on a blocking signal; `warn` always reports success while still commenting — useful for dogfooding before enforcing. |
| `bot-allowlist` | `""` | Comma-separated author logins to exclude from analysis, added on top of the built-in defaults (`dependabot[bot]`, `renovate[bot]`, `github-actions[bot]`). |
| `risky-file-patterns` | `""` | Comma-separated extra glob patterns treated as high-risk, appended to the built-in list. |
| `volume-threshold` | `300` | Max lines changed within `time-window` before `volume-anomaly` fires. Must be a positive integer. |
| `time-window` | `10` | Time window in minutes used to evaluate commit velocity. Must be a positive integer. |
| `solo-maintainer-mode` | `off` | `off`, `self-ack`, or `second-agent` — see [Solo-maintainer mode](#solo-maintainer-mode) above. |
| `self-ack-min-length` | `20` | Minimum character length of the justification in a `/guardrail-ack: <reason>` comment. Only relevant in `self-ack` mode. |
| `self-ack-cooldown-minutes` | `15` | Minimum minutes between the PR's last commit and a valid ack. Only relevant in `self-ack` mode. |
| `trusted-reviewer-agents` | `""` | Comma-separated logins trusted as a second reviewing agent. Never autodetected. Only relevant in `second-agent` mode. |
| `github-token` | `${{ github.token }}` | Token used to read PR data and post the check/comment. You shouldn't need to set this. |

Try it in `warn` mode first:

```yaml
      - uses: vora-co/pr-guardrail-action@main
        with:
          mode: warn
```

## Edge cases it handles

- **PR with no commits synced yet** — the check run stays `in_progress` instead of asserting a false pass or crashing.
- **Binary or large files** — excluded from text-pattern analysis; GitHub omits the diff patch for them, and this Action skips files it can't read as text.
- **External fork PRs with a read-only token** — check-run creation and PR commenting fail gracefully (a warning in the logs) instead of crashing the whole run.
- **Invalid threshold config** (zero or negative) — fails fast with a clear log message rather than gating on an undefined calculation.
- **No branch protection configured** — the check still runs and reports for visibility; see the warning above.

## Why this exists

This reuses the human-gate logic from Vora Engine's Reviewer/Hook/Scan/Veto module — the same pattern used internally to make sure an agent is never the sole judge of its own code. PR Guardrail is the free, standalone version of that idea: an explicit human gate on the changes that actually carry risk, with nothing proprietary about how Vora Engine works internally exposed here.

## Scope

Not built in v1 (by design, not an oversight): GitHub Marketplace publishing, GitLab/Bitbucket support, an LLM-based mode (this Action never sends your code anywhere), semantic/security code analysis, a dashboard or historical reporting, and integration with Vora's separate Attribution/Categorization Scanner.

## License

[MIT](LICENSE)
