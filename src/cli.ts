#!/usr/bin/env node

import { Command } from "commander"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import {
  buildCommand,
  testTtsCommand,
  ttsCommand,
  validateCommand,
} from "./builder.js"
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
  .option(
    "-n, --name <filename>",
    "output video filename",
    CONFIG.DEFAULT_OUTPUT_FILENAME
  )
  .option("-f, --force", "force overwrite existing output files")
  .option(
    "-k, --keep [type]",
    "keep intermediate files: video, audio, or thumb"
  )
  .option(
    "-m, --model <name>",
    "TTS model name to use",
    CONFIG.DEFAULT_TTS_MODEL
  )
  .option("--bg-video <path>", "background video file path")
  .option("--bgv <path>", "alias for --bg-video")
  .option("--bg-music <path>", "background music file path")
  .option("--bgm <path>", "alias for --bg-music")
  .action((options) =>
    buildCommand({
      input: options.input,
      output: options.output,
      name: options.name,
      force: options.force,
      keep: options.keep,
      model: options.model,
      bgVideo: options.bgVideo || options.bgv,
      bgMusic: options.bgMusic || options.bgm,
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
  .option(
    "-m, --model <name>",
    "TTS model name to use",
    CONFIG.DEFAULT_TTS_MODEL
  )
  .action((options) =>
    ttsCommand({
      input: options.input,
      output: options.output,
      force: options.force,
      model: options.model,
    })
  )

program
  .command("test-tts")
  .description(
    "synthesize TTS audio (.wav) for all text files using ALL available models"
  )
  .option("-i, --input <dir>", "input directory path", CONFIG.DEFAULT_INPUT_DIR)
  .option("-o, --output <dir>", "output directory path", "test_output")
  .option("-f, --force", "overwrite existing .wav files")
  .action((options) =>
    testTtsCommand({
      input: options.input,
      output: options.output,
      force: options.force,
    })
  )

program.parse(process.argv)
