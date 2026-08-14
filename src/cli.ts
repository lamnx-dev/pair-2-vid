#!/usr/bin/env node

import * as clack from "@clack/prompts"
import { Command } from "commander"
import fs from "fs"
import path from "path"
import picocolors from "picocolors"
import { fileURLToPath } from "url"
import {
  buildCommand,
  testTtsCommand,
  ttsCommand,
  validateCommand,
} from "./builder.js"
import { CONFIG } from "./config.js"
import { getDefaultTTSModel, setDefaultTTSModel } from "./user-config.js"

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
  .option(
    "-k, --keep [type]",
    "keep intermediate files: video, audio, or thumb"
  )
  .option("-m, --model <name>", "TTS model name to use", getDefaultTTSModel())
  .action((options) =>
    buildCommand({
      input: options.input,
      output: options.output,
      force: options.force,
      keep: options.keep,
      model: options.model,
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
  .option("-m, --model <name>", "TTS model name to use", getDefaultTTSModel())
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

program
  .command("models")
  .description("select and set the default TTS model")
  .action(async () => {
    const modelsDir = path.resolve(__dirname, "../models")
    if (!fs.existsSync(modelsDir)) {
      console.log(picocolors.red("No models directory found."))
      process.exit(1)
    }

    const files = fs.readdirSync(modelsDir)
    const modelNames = files
      .filter((f) => f.endsWith(".onnx"))
      .map((f) => path.basename(f, ".onnx"))
      .sort()

    if (modelNames.length === 0) {
      console.log(
        picocolors.yellow("No TTS models found in models/ directory.")
      )
      process.exit(1)
    }

    const currentDefault = getDefaultTTSModel()

    clack.intro(
      picocolors.bold(
        picocolors.bgCyan(picocolors.black(" p2v — TTS Model Selector "))
      )
    )

    const selectedModel = await clack.select({
      message: `Select default TTS model ${picocolors.dim(`(current: ${picocolors.cyan(currentDefault)})`)}:`,
      options: modelNames.map((name) => ({
        value: name,
        label: name,
      })),
      initialValue: currentDefault,
    })

    if (clack.isCancel(selectedModel)) {
      clack.cancel("Cancelled.")
      process.exit(0)
    }

    setDefaultTTSModel(String(selectedModel))

    const modelChanged = selectedModel !== currentDefault
    clack.outro(
      modelChanged
        ? `Default model changed to ${picocolors.green(picocolors.bold(String(selectedModel)))}`
        : `Default model kept as ${picocolors.green(picocolors.bold(String(selectedModel)))}`
    )
  })

program.parse(process.argv)
