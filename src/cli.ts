#!/usr/bin/env node

import { Command } from "commander"
import { buildCommand, validateCommand } from "./builder.js"

const program = new Command()

program
  .name("p2v")
  .description(
    "pair2vid (p2v): Công cụ CLI chuyển đổi hàng loạt các cặp file ảnh và âm thanh thành video MP4"
  )
  .version("1.0.0")

program
  .command("build", { isDefault: true })
  .description(
    "Build MP4 videos from input image-audio pairs (default command)"
  )
  .option("-i, --input <dir>", "Input directory path", ".")
  .option("-o, --output <dir>", "Output directory path", "./output")
  .option("-f, --force", "Force overwrite existing output files", false)
  .action(async (options) => {
    await buildCommand({
      input: options.input,
      output: options.output,
      overwrite: options.force,
    })
  })

program
  .command("validate")
  .description("Validate input directory for image-audio pairs")
  .option("-i, --input <dir>", "Input directory path", ".")
  .action(async (options) => {
    const isValid = await validateCommand(options.input)
    if (!isValid) {
      process.exit(1)
    }
  })

program.parse(process.argv)
