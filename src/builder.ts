import fs from "fs"
import path from "path"
import picocolors from "picocolors"
import {
  checkFFmpegAvailability,
  getAudioDuration,
  renderVideo,
  verifyVideo,
} from "./ffmpeg.js"
import { scanInputDirectory } from "./scanner.js"
import { BuildOptions, ScanResult } from "./types.js"

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

  await checkFFmpegAvailability()

  const result = await validateScanResult(inputDir)
  if (!result) {
    process.exit(1)
  }

  // Create output directory if needed
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log("Building videos...\n")

  let createdCount = 0

  for (let i = 0; i < result.pairs.length; i++) {
    const pair = result.pairs[i]
    const indexStr = `[${i + 1}/${result.pairs.length}]`
    const targetFileName = `${pair.basename}.mp4`
    const outputPath = path.join(outputDir, targetFileName)
    const relOutputPath = path.relative(process.cwd(), outputPath) || outputPath

    console.log(`${indexStr} ${pair.basename}`)

    // Check if target file already exists and overwrite flag is not passed
    if (fs.existsSync(outputPath) && !options.overwrite) {
      console.log(
        picocolors.yellow(
          `      ⚠ ${relOutputPath} already exists (use -f or --force to replace)`
        )
      )
      console.log()
      continue
    }

    try {
      const duration = await getAudioDuration(pair.audioPath)
      console.log(`      Audio duration: ${duration.toFixed(3)}s`)

      await renderVideo(pair.imagePath, pair.audioPath, outputPath, duration, {
        fps: options.fps,
      })

      // Verify output MP4
      const verification = await verifyVideo(
        outputPath,
        duration,
        pair.imageDimensions?.width ?? 0,
        pair.imageDimensions?.height ?? 0
      )

      if (!verification.valid) {
        console.log(
          picocolors.red(
            `      ✗ Output verification failed for ${relOutputPath}: ${verification.errors.join(", ")}`
          )
        )
        process.exit(1)
      }

      console.log(picocolors.green(`      ✓ ${relOutputPath}`))
      createdCount++
    } catch (err: any) {
      console.error(
        picocolors.red(`      ✗ Failed to render video: ${err.message}`)
      )
      process.exit(1)
    }

    console.log()
  }

  console.log("Done.")
  console.log(`Created ${createdCount} videos.`)
}
