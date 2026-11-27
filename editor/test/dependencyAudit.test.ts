// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { npmAudit } from "audit-ci";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import policy from "../audit-ci.json";

const previouslyAllowlistedAdvisory = "GHSA-fc5q-39xc-vjpf";

function report(advisory = previouslyAllowlistedAdvisory, severity = "high") {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      picomatch: {
        name: "picomatch",
        severity,
        isDirect: false,
        via: [{
          source: 1,
          name: "picomatch",
          dependency: "picomatch",
          title: "Test advisory",
          url: `https://github.com/advisories/${advisory}`,
          severity,
          range: "<=4.0.7",
        }],
        effects: ["vite"],
        range: "<=4.0.7",
        nodes: ["node_modules/picomatch"],
        fixAvailable: false,
      },
      vite: {
        name: "vite",
        severity,
        isDirect: true,
        via: ["picomatch"],
        effects: [],
        range: "*",
        nodes: ["node_modules/vite"],
        fixAvailable: false,
      },
    },
    metadata: {},
  };
}

describe("dependency audit policy", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "jot-audit-"));
    vi.stubEnv("PATH", `${directory}${delimiter}${process.env.PATH}`);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  function audit(output: object) {
    const npm = join(directory, "npm");
    writeFileSync(
      npm,
      `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(output))});\n`,
      { mode: 0o755 },
    );
    return npmAudit({ ...policy, directory, "package-manager": "npm" });
  }

  it("allows a report without vulnerabilities", async () => {
    const result = await audit({ auditReportVersion: 2, vulnerabilities: {}, metadata: {} });
    expect(result.failedLevelsFound).toEqual([]);
  });

  it.each(["moderate", "high", "critical"])(
    "blocks %s advisories, including their transitive effects",
    async (severity) => {
      await expect(audit(report("GHSA-xxxx-xxxx-xxxx", severity)))
        .rejects.toThrow("Failed security audit");
    },
  );

  it("does not exempt the previously allowlisted advisory", async () => {
    await expect(audit(report())).rejects.toThrow("Failed security audit");
  });

  it("does not turn an audit service failure into a pass", async () => {
    await expect(audit({ error: { code: "ENOAUDIT", summary: "unavailable" } }))
      .rejects.toThrow("ENOAUDIT");
  });
});
