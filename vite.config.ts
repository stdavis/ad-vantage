import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig(({ command }) => ({
  plugins: [crx({ manifest })],
  server: {
    cors: true,
  },
  build: {
    outDir: command === "serve" ? "dist-dev" : "dist",
    emptyOutDir: true,
  },
}));
