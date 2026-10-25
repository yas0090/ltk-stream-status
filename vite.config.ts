import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "src/web",
  base: "./",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
