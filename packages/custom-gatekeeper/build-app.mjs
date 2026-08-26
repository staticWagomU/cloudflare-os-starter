import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBinEntry } from "../../cloudflare-os/scripts/bin-entry.ts";
import { pnpmCommand } from "../../cloudflare-os/scripts/pnpm-command.ts";

const pkgDir = resolve(fileURLToPath(import.meta.url), "..");
const watch = process.argv.includes("--watch");

console.log(
  watch
    ? "watching restricted knowledge app for changes..."
    : "building restricted knowledge app single-file bundle...",
);

const viteArgs = ["build", "-c", "vite.app.config.ts", ...(watch ? ["--watch"] : [])];
const viteEntry = resolveBinEntry(pkgDir, "vite");
const [command, argv] = viteEntry
  ? [process.execPath, [viteEntry, ...viteArgs]]
  : pnpmCommand(["exec", "vite", ...viteArgs]);

execFileSync(command, argv, {
  cwd: pkgDir,
  stdio: "inherit",
  env: { ...process.env },
});
