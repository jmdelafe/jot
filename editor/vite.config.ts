import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Jot's editor is loaded from a bundled file:// resource inside the app,
// with no server and no network access, so everything must be inlined
// into a single self-contained HTML file.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../Sources/Jot/Resources/editor",
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000
  }
});
