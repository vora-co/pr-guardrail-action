import { detectRiskyFile } from "../../src/signals/riskyFile";
import { PullFile } from "../../src/types";

function file(filename: string): PullFile {
  return { filename, status: "modified", additions: 1, deletions: 0, changes: 1 };
}

describe("detectRiskyFile", () => {
  it("flags a DB migration file", () => {
    const result = detectRiskyFile([file("db/migrations/20260811_add_users.sql")]);
    expect(result.detected).toBe(true);
  });

  it("flags a Terraform file", () => {
    const result = detectRiskyFile([file("infra/main.tf")]);
    expect(result.detected).toBe(true);
  });

  it("flags a CI workflow file", () => {
    const result = detectRiskyFile([file(".github/workflows/deploy.yml")]);
    expect(result.detected).toBe(true);
  });

  it("flags a secrets/env file", () => {
    const result = detectRiskyFile([file(".env.production")]);
    expect(result.detected).toBe(true);
  });

  it("does not flag an ordinary source file", () => {
    const result = detectRiskyFile([file("src/components/Button.tsx")]);
    expect(result.detected).toBe(false);
    expect(result.details).toHaveLength(0);
  });

  it("applies user-supplied extra patterns", () => {
    const result = detectRiskyFile([file("config/billing.yml")], ["**/billing.*"]);
    expect(result.detected).toBe(true);
  });

  it("lists every risky file, not just the first", () => {
    const result = detectRiskyFile([file("infra/main.tf"), file(".env")]);
    expect(result.details).toHaveLength(2);
  });
});
