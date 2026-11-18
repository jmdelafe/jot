import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function thirdPartyNotices(editorDirectory) {
  const { packages } = JSON.parse(readFileSync(join(editorDirectory, "package-lock.json"), "utf8"));
  const sections = [];

  for (const [packagePath, locked] of Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) {
    // Vite injects its module-preload runtime into the bundled editor.
    if (!packagePath || (locked.dev && packagePath !== "node_modules/vite")) continue;
    if (!packagePath.startsWith("node_modules/") || packagePath.split("/").includes("..")) {
      throw new Error(`Invalid dependency path: ${packagePath}`);
    }

    const directory = join(editorDirectory, packagePath);
    const installed = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    if (installed.version !== locked.version) {
      throw new Error(`Dependency version mismatch for ${packagePath}; run make bootstrap`);
    }

    const files = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^(licen[sc]e|copying|notice)([-_.]|$)/i.test(entry.name))
      .map(entry => entry.name)
      .sort();
    if (!files.some(name => /^(licen[sc]e|copying)([-_.]|$)/i.test(name))) {
      throw new Error(`Missing license text for ${installed.name}@${installed.version}`);
    }

    const notices = files.map(name => `${name}\n${readFileSync(join(directory, name), "utf8").trim()}`);
    sections.push(`${installed.name}@${installed.version}\n${"=".repeat(72)}\n${notices.join("\n\n")}`);
  }

  return `Third-party notices for Jot's editor dependencies and Vite runtime.\nSome dependencies may be removed by bundling.\n\n${sections.join("\n\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const editorDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../editor");
  process.stdout.write(thirdPartyNotices(editorDirectory));
}
