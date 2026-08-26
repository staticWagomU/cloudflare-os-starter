import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

function emitAppText(): Plugin {
  return {
    name: "emit-restricted-knowledge-app",
    closeBundle() {
      const htmlPath = resolve(pkgDir, "dist-app", "app", "index.html");
      let html = readFileSync(htmlPath, "utf8");
      html = html.replace(
        /<script type="module" crossorigin src="\/([^"]+)"><\/script>/g,
        (_match, file: string) => {
          const script = readFileSync(resolve(pkgDir, "dist-app", file), "utf8");
          return `<script type="module">${script}\n//# sourceURL=app:///gatekeeper/collections/restricted-knowledge.js</script>`;
        },
      );
      html = html.replace(
        /<link rel="stylesheet" crossorigin href="\/([^"]+)">/g,
        (_match, file: string) => {
          const css = readFileSync(resolve(pkgDir, "dist-app", file), "utf8");
          return `<style>${css}</style>`;
        },
      );
      const outFile = resolve(pkgDir, "src", "generated", "app.txt");
      const contents =
        "<!-- Generated from packages/custom-gatekeeper/app by build-app.mjs. Do not edit. -->\n" +
        html;
      if (existsSync(outFile) && readFileSync(outFile, "utf8") === contents) {
        console.log(`app.txt unchanged (${(html.length / 1024).toFixed(0)} KiB), skipping write`);
        return;
      }
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, contents);
      console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} KiB)`);
    },
  };
}

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  plugins: [emitAppText()],
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 700,
    minify: isWatch ? false : "esbuild",
    rollupOptions: {
      input: "app/index.html",
      onwarn(warning, handler) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes("use client")) return;
        handler(warning);
      },
      output: {
        entryFileNames: "restricted-knowledge.js",
      },
    },
    watch: isWatch
      ? {
          exclude: [
            "**/node_modules/**",
            "**/dist-app/**",
            "**/.wrangler/**",
            "**/generated/**",
          ],
        }
      : undefined,
  },
});
