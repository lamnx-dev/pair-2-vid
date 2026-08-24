import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/cli.ts", "src/tts-worker.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
})
