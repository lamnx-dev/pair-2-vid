#!/usr/bin/env node

import { Command } from "commander"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { buildCommand, ttsCommand, validateCommand } from "./builder.js"
import { CONFIG } from "./config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")
)

const program = new Command()

program.name("p2v").version(pkg.version)

program
  .command("build", { isDefault: true })
  .description(
    "build MP4 videos from input image-audio pairs (default command)"
  )
  .option("-i, --input <dir>", "input directory path", CONFIG.DEFAULT_INPUT_DIR)
  .option(
    "-o, --output <dir>",
    "output directory path",
    CONFIG.DEFAULT_OUTPUT_DIR
  )
  .option("-f, --force", "force overwrite existing output files")
  .option("-k, --keep [type]", "keep intermediate files: video, audio, or all")
  .action((options) =>
    buildCommand({
      input: options.input,
      output: options.output,
      force: options.force,
      keep: options.keep,
    })
  )

program
  .command("validate")
  .description("validate input directory for image-audio pairs")
  .option("-i, --input <dir>", "input directory path", CONFIG.DEFAULT_INPUT_DIR)
  .action(async (options) => {
    const isValid = await validateCommand(options.input)
    if (!isValid) {
      process.exit(1)
    }
  })

program
  .command("tts")
  .description(
    "synthesize TTS audio (.wav) for all text files in input directory"
  )
  .option("-i, --input <dir>", "input directory path", CONFIG.DEFAULT_INPUT_DIR)
  .option(
    "-o, --output <dir>",
    "output directory path",
    CONFIG.DEFAULT_OUTPUT_DIR
  )
  .option("-f, --force", "overwrite existing .wav files")
  .action((options) =>
    ttsCommand({
      input: options.input,
      output: options.output,
      force: options.force,
    })
  )

program.parse(process.argv)
