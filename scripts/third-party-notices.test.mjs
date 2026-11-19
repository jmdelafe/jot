import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { thirdPartyNotices } from "./third-party-notices.mjs";

let directory;
let packages;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "jot-notices-"));
  packages = { "": { name: "test-editor" } };
  const fontAssets = join(directory, "src/assets");
  mkdirSync(fontAssets, { recursive: true });
  writeFileSync(join(fontAssets, "Monaspace-OFL.txt"), "Monaspace font license");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function dependency(path, { name = path.split("node_modules/").at(-1), dev = false, files = { LICENSE: "License text" } } = {}) {
  packages[path] = { version: "1.0.0", dev };
  const root = join(directory, path);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  for (const [file, text] of Object.entries(files)) {
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  }
}

function generate() {
  writeFileSync(join(directory, "package-lock.json"), JSON.stringify({ packages }));
  return thirdPartyNotices(directory);
}

test("includes scoped and nested production licenses and notices, plus Vite's runtime license", () => {
  dependency("node_modules/@scope/editor", { files: { "LICENSE.md": "Editor license", NOTICE: "Attribution" } });
  dependency("node_modules/@scope/editor/node_modules/parser", { files: { "LICENSE-MIT.txt": "Parser license" } });
  dependency("node_modules/vite", { dev: true, files: { "LICENSE.md": "Vite license" } });
  dependency("node_modules/test-runner", { dev: true, files: {} });

  const output = generate();
  for (const text of ["@scope/editor@1.0.0", "Editor license", "Attribution", "parser@1.0.0", "Parser license", "Vite license"]) {
    assert.ok(output.includes(text), text);
  }
  assert.ok(output.includes("Monaspace Argon Variable Webfont"));
  assert.ok(output.includes("Monaspace font license"));
  assert.ok(!output.includes("test-runner"));
});

test("refuses a package with a notice but no license text", () => {
  dependency("node_modules/missing", { files: { NOTICE: "Not a license" } });
  assert.throws(generate, /Missing license text for missing@1.0.0/);
});

test("refuses dependencies that differ from the lockfile", () => {
  dependency("node_modules/stale");
  packages["node_modules/stale"].version = "2.0.0";
  assert.throws(generate, /Dependency version mismatch/);
});

test("refuses dependency paths outside node_modules", () => {
  packages["node_modules/../../outside"] = { version: "1.0.0" };
  assert.throws(generate, /Invalid dependency path/);
});
