import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(".build/site"),
  base: "/",
  appType: "mpa",
  build: {
    outDir: resolve("dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(".build/site/index.html"),
        cli: resolve(".build/site/docs/cli/index.html"),
      },
    },
  },
});
