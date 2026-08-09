import fs from "fs"
import os from "os"
import path from "path"
import picocolors from "picocolors"
import {
  checkFFmpegAvailability,
  concatVideosWithGap,
  getAudioDuration,
  renderVideo,
  verifyVideo,
} from "./ffmpeg.js"
import { scanInputDirectory } from "./scanner.js"
import { BuildOptions, ScanResult } from "./types.js"
import { CONFIG } from "./config.js"

export async function validateScanResult(
  inputDir: string
): Promise<ScanResult | null> {
  console.log("Scanning input...\n")

  let result: ScanResult
  try {
    result = await scanInputDirectory(inputDir)
  } catch (err: any) {
    console.error(picocolors.red(`Error scanning directory: ${err.message}`))
    return null
  }

  // Print duplicate image errors
  if (result.duplicateImages.size > 0) {
    for (const [basename, files] of result.duplicateImages.entries()) {
      console.log(
        picocolors.red(`✗ Multiple images found for "${basename}":\n`)
      )
      for (const file of files) {
        console.log(`- ${file}`)
      }
      console.log("\nPlease keep only one image.\n")
    }
  }

  // Print duplicate audio errors
  if (result.duplicateAudios.size > 0) {
    for (const [basename, files] of result.duplicateAudios.entries()) {
      console.log(
        picocolors.red(`✗ Multiple audios found for "${basename}":\n`)
      )
      for (const file of files) {
        console.log(`- ${file}`)
      }
      console.log("\nPlease keep only one audio.\n")
    }
  }

  // Print missing image errors
  if (result.missingImages.length > 0) {
    for (const audioFile of result.missingImages) {
      console.log(picocolors.red(`✗ Missing image for: ${audioFile}`))
    }
  }

  // Print missing audio errors
  if (result.missingAudios.length > 0) {
    for (const imageFile of result.missingAudios) {
      console.log(picocolors.red(`✗ Missing audio for: ${imageFile}`))
    }
  }

  if (
    result.duplicateImages.size > 0 ||
    result.duplicateAudios.size > 0 ||
    result.missingImages.length > 0 ||
    result.missingAudios.length > 0
  ) {
    return null
  }

  if (result.pairs.length === 0) {
    console.log(picocolors.yellow("⚠ No media pairs found in input directory."))
    return null
  }

  // Print matched valid pairs
  for (const pair of result.pairs) {
    console.log(
      picocolors.green(`✓ ${pair.imageFileName} + ${pair.audioFileName}`)
    )
  }

  console.log(`\nFound ${result.pairs.length} valid pairs.\n`)

  console.log(picocolors.green("✓ No missing files"))
  console.log(picocolors.green("✓ No duplicate basenames"))

  return result
}

export async function validateCommand(inputDir: string): Promise<boolean> {
  const result = await validateScanResult(inputDir)
  return result !== null
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  const inputDir = path.resolve(options.input)
  const outputDir = path.resolve(options.output)
  const concatFileName = CONFIG.DEFAULT_CONCAT_FILENAME
  const finalOutputPath = path.join(outputDir, concatFileName)
  const relFinalPath =
    path.relative(process.cwd(), finalOutputPath) || finalOutputPath

  await checkFFmpegAvailability()

  const result = await validateScanResult(inputDir)
  if (!result) {
    process.exit(1)
  }

  // Check if content.mp4 already exists and force flag is not passed
  if (fs.existsSync(finalOutputPath) && !options.overwrite) {
    console.log(
      picocolors.yellow(
        `⚠ ${relFinalPath} already exists (use -f or --force to replace)\n`
      )
    )
    return
  }

  // Create output directory if needed
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const keepSingles = Boolean(options.keepSingles)
  const singlesDir = path.join(outputDir, CONFIG.SINGLES_DIR_NAME)

  if (keepSingles && !fs.existsSync(singlesDir)) {
    fs.mkdirSync(singlesDir, { recursive: true })
  }

  // Create temporary directory for segment rendering if not keeping singles directly
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2v_"))
  const videoPathsForConcat: string[] = []

  console.log("Processing media pairs...\n")

  try {
    for (let i = 0; i < result.pairs.length; i++) {
      const pair = result.pairs[i]
      const indexStr = `[${i + 1}/${result.pairs.length}]`
      const singleFileName = `${pair.basename}.mp4`

      const targetVideoPath = keepSingles
        ? path.join(singlesDir, singleFileName)
        : path.join(tempDir, `${i}_${pair.basename}.mp4`)

      const relTarget =
        path.relative(process.cwd(), targetVideoPath) || targetVideoPath

      console.log(`${indexStr} ${pair.basename}`)

      if (keepSingles && fs.existsSync(targetVideoPath) && !options.overwrite) {
        console.log(
          picocolors.yellow(
            `      ⚠ ${relTarget} already exists (use -f or --force to replace)`
          )
        )
        videoPathsForConcat.push(targetVideoPath)
        console.log()
        continue
      }

      const duration = await getAudioDuration(pair.audioPath)
      console.log(`      Audio duration: ${duration.toFixed(3)}s`)

      await renderVideo(pair.imagePath, pair.audioPath, targetVideoPath, duration)

      const verification = await verifyVideo(
        targetVideoPath,
        duration,
        pair.imageDimensions?.width ?? 0,
        pair.imageDimensions?.height ?? 0
      )

      if (!verification.valid) {
        console.log(
          picocolors.red(
            `      ✗ Verification failed for segment ${pair.basename}: ${verification.errors.join(", ")}`
          )
        )
        process.exit(1)
      }

      if (keepSingles) {
        console.log(picocolors.green(`      ✓ Saved single video: ${relTarget}`))
      } else {
        console.log(picocolors.green(`      ✓ Rendered segment`))
      }

      videoPathsForConcat.push(targetVideoPath)
      console.log()
    }

    console.log(`Concatenating ${videoPathsForConcat.length} videos into ${concatFileName}...`)

    await concatVideosWithGap(videoPathsForConcat, finalOutputPath)

    console.log(picocolors.green(`\n✓ Created: ${relFinalPath}\n`))
  } catch (err: any) {
    console.error(picocolors.red(`\n✗ Failed to build video: ${err.message}`))
    process.exit(1)
  } finally {
    // Clean up temporary segment directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }

  console.log("Done.")
}
