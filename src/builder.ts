import fs from "fs"
import { Ora } from "ora"
import os from "os"
import path from "path"
import picocolors from "picocolors"
import { CONFIG } from "./config.js"
import {
  checkFFmpegAvailability,
  concatVideosWithGap,
  getAudioDuration,
  renderVideo,
  verifyVideo,
} from "./ffmpeg.js"
import { scanInputDirectory } from "./scanner.js"
import { BuildOptions, ScanResult } from "./types.js"
import { createSpinner } from "./ui.js"

export async function validateScanResult(
  inputDir: string,
  spinner: Ora
): Promise<ScanResult | null> {
  let result: ScanResult
  try {
    result = await scanInputDirectory(inputDir)
  } catch (err: any) {
    spinner.fail(`Error scanning directory: ${err.message}`)
    return null
  }

  if (
    result.duplicateImages.size > 0 ||
    result.duplicateAudios.size > 0 ||
    result.missingImages.length > 0 ||
    result.missingAudios.length > 0
  ) {
    spinner.fail("Scan failed with invalid files")
    return null
  }

  if (result.pairs.length === 0) {
    spinner.warn("No media pairs found in input directory")
    return null
  }

  return result
}

export async function validateCommand(inputDir: string): Promise<boolean> {
  const spinner = createSpinner("Scanning input directory...")
  const result = await validateScanResult(inputDir, spinner)
  if (result) {
    spinner.succeed(
      `Found ${picocolors.bold(result.pairs.length.toString())} valid media pairs ${picocolors.dim(`(${result.pairs.map((p) => p.basename).join(", ")})`)}`
    )
  }
  return result !== null
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  const startTime = Date.now()
  const inputDir = path.resolve(options.input)
  const outputDir = path.resolve(options.output)
  const concatFileName = CONFIG.DEFAULT_CONCAT_FILENAME
  const finalOutputPath = path.join(outputDir, concatFileName)
  const relFinalPath =
    path.relative(process.cwd(), finalOutputPath) || finalOutputPath

  const spinner = createSpinner("Checking FFmpeg availability...")

  await checkFFmpegAvailability(spinner)

  spinner.text = "Scanning input directory..."
  const result = await validateScanResult(inputDir, spinner)
  if (!result) {
    process.exit(1)
  }

  if (fs.existsSync(finalOutputPath) && !options.overwrite) {
    spinner.warn(
      `${relFinalPath} already exists (use -f or --force to replace)`
    )
    return
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const keepSingles = Boolean(options.keepSingles)
  const singlesDir = path.join(outputDir, CONFIG.SINGLES_DIR_NAME)

  if (keepSingles && !fs.existsSync(singlesDir)) {
    fs.mkdirSync(singlesDir, { recursive: true })
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2v_"))
  const videoPathsForConcat: string[] = []

  try {
    for (let i = 0; i < result.pairs.length; i++) {
      const pair = result.pairs[i]
      const singleFileName = `${pair.basename}.mp4`

      const targetVideoPath = keepSingles
        ? path.join(singlesDir, singleFileName)
        : path.join(tempDir, `${i}_${pair.basename}.mp4`)

      spinner.text = `Processing media pairs (${i + 1}/${result.pairs.length})...`

      if (keepSingles && fs.existsSync(targetVideoPath) && !options.overwrite) {
        videoPathsForConcat.push(targetVideoPath)
        continue
      }

      const duration = await getAudioDuration(pair.audioPath)
      await renderVideo(
        pair.imagePath,
        pair.audioPath,
        targetVideoPath,
        duration
      )

      const verification = await verifyVideo(
        targetVideoPath,
        duration,
        pair.imageDimensions?.width ?? 0,
        pair.imageDimensions?.height ?? 0
      )

      if (!verification.valid) {
        spinner.fail(
          `Verification failed for ${pair.basename}: ${verification.errors.join(", ")}`
        )
        process.exit(1)
      }

      videoPathsForConcat.push(targetVideoPath)
    }

    spinner.text = `Concatenating ${videoPathsForConcat.length} videos into ${concatFileName}...`
    await concatVideosWithGap(videoPathsForConcat, finalOutputPath)

    const elapsedTime = (Date.now() - startTime) / 1000
    const timeStr = picocolors.dim(` in ${elapsedTime.toFixed(2)}s`)
    spinner.succeed(
      ` Done! Rendered ${result.pairs.length} pairs into ${picocolors.bold(picocolors.cyan(relFinalPath))}${timeStr}`
    )
  } catch (err: any) {
    if (spinner.isSpinning)
      spinner.fail(`Failed to build video: ${err.message}`)
    process.exit(1)
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}
