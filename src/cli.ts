#!/usr/bin/env node

import { Command } from "commander"
import { buildCommand, validateCommand } from "./builder.js"
import { CONFIG } from "./config.js"

const program = new Command()

program.name("p2v").version("1.1.0")

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
  .option("-f, --force", "force overwrite existing output files", false)
  .option(
    "-s, --singles",
    "keep individual MP4 files alongside content.mp4",
    false
  )
  .action(async (options) => {
    await buildCommand({
      input: options.input,
      output: options.output,
      overwrite: options.force,
      keepSingles: options.singles,
    })
  })

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

program.parse(process.argv)
