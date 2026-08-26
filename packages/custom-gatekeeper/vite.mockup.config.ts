import { defineConfig } from "vite";

export default defineConfig({
  root: "mockup",
  esbuild: {
    jsx: "automatic",
  },
  build: {
    chunkSizeWarningLimit: 700,
    emptyOutDir: true,
    outDir: "../dist-mockup",
    rollupOptions: {
      onwarn(warning, handler) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes("use client")) return;
        handler(warning);
      },
    },
  },
});
