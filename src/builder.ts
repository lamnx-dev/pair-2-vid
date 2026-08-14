import fs from "fs"
import { Ora } from "ora"
import os from "os"
import path from "path"
import picocolors from "picocolors"
import { fileURLToPath } from "url"
import { CONFIG } from "./config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRootDir = path.resolve(__dirname, "..")

import {
  checkFFmpegAvailability,
  concatVideosWithGap,
  extractVideoFrame,
  getAudioDuration,
  renderVideo,
  verifyVideo,
} from "./ffmpeg.js"
import { OnnxTTSEngine } from "./onnx.js"
import {
  getRandomMediaFile,
  isIgnoredFile,
  isTitleFile,
  scanInputDirectory,
} from "./scanner.js"
import { generateThumbnailImage } from "./thumbnail.js"
import {
  BuildOptions,
  MediaPair,
  ScanResult,
  SynthesizeTTSOptions,
  SynthesizeTTSResult,
  TestTTSCommandOptions,
  TTSCommandOptions,
  TTSItem,
} from "./types/index.js"
import { createSpinner } from "./ui.js"

async function synthesizeTTSForItems({
  items,
  getWavPath,
  force,
  model,
}: SynthesizeTTSOptions): Promise<SynthesizeTTSResult> {
  if (items.length === 0) return { synthesized: 0, skipped: 0 }

  const spinner = createSpinner("Initializing ONNX TTS Engine...")

  const ttsEngine = new OnnxTTSEngine(model)
  await ttsEngine.init()

  let synthesized = 0
  let skipped = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const wavPath = getWavPath(item)
    if (!force && fs.existsSync(wavPath)) {
      item.audioPath = wavPath
      skipped++
      continue
    }
    const wavFilename = picocolors.cyan(path.basename(wavPath))
    spinner.text = `Synthesizing segment ${i + 1}/${items.length} (${wavFilename})...`
    spinner.start()
    await ttsEngine.synthesizeFile(item.textPath, wavPath)
    item.audioPath = wavPath
    synthesized++
  }

  const parts: string[] = []
  if (synthesized > 0)
    parts.push(picocolors.green(`${synthesized} synthesized`))
  if (skipped > 0) parts.push(picocolors.yellow(`${skipped} skipped`))

  spinner.succeed(`TTS audio files: ${parts.join(", ") || "0 files"}`)

  return { synthesized, skipped }
}

async function validateScanResult(
  inputDir: string
): Promise<ScanResult | null> {
  const spinner = createSpinner("Scanning input directory...")
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
    spinner.fail("Validation failed with invalid files")

    if (result.duplicateImages.size > 0) {
      console.log(picocolors.yellow("\nDuplicate Image Basenames:"))
      for (const [basename, files] of result.duplicateImages.entries()) {
        console.log(`- ${basename}: ${files.join(", ")}`)
      }
    }
    if (result.duplicateAudios.size > 0) {
      console.log(picocolors.yellow("\nDuplicate Audio Basenames:"))
      for (const [basename, files] of result.duplicateAudios.entries()) {
        console.log(`- ${basename}: ${files.join(", ")}`)
      }
    }

    if (result.missingImages.length > 0) {
      console.log(picocolors.red("\nPairs missing Image files:"))
      for (const basename of result.missingImages) {
        console.log(`- ${basename}`)
      }
    }

    if (result.missingAudios.length > 0) {
      console.log(picocolors.red("\nPairs missing Audio files:"))
      for (const basename of result.missingAudios) {
        console.log(`- ${basename}`)
      }
    }

    return null
  }

  if (result.pairs.length === 0) {
    spinner.fail("No valid image-audio pairs found")
    return null
  }

  spinner.succeed(
    `Scanned input directory (${picocolors.cyan(result.pairs.length.toString())} media pairs found)`
  )
  return result
}

export async function validateCommand(inputDir: string): Promise<boolean> {
  const resolvedPath = path.resolve(inputDir)
  const result = await validateScanResult(resolvedPath)
  return result !== null
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  const startTime = Date.now()
  const inputDir = path.resolve(options.input)
  const outputDir = path.resolve(options.output)
  const outputFileName = CONFIG.DEFAULT_OUTPUT_FILENAME
  const finalOutputPath = path.join(outputDir, outputFileName)
  const relFinalPath =
    path.relative(process.cwd(), finalOutputPath) || finalOutputPath

  if (fs.existsSync(finalOutputPath) && !options.force) {
    const warnSpinner = createSpinner("Checking output file...")
    warnSpinner.warn(
      `${picocolors.cyan(relFinalPath)} already exists (use ${picocolors.yellow("-f")} or ${picocolors.yellow("--force")} to replace)`
    )
    return
  }

  // Step 1: Check FFmpeg availability
  await checkFFmpegAvailability()

  // Step 2: Scan input directory
  const result = await validateScanResult(inputDir)
  if (!result) {
    process.exit(1)
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const keepVal =
    typeof options.keep === "string"
      ? options.keep.toLowerCase()
      : options.keep
        ? "all"
        : "none"
  const keepVideo = keepVal === "video" || keepVal === "all"
  const keepAudio = keepVal === "audio" || keepVal === "all"
  const keepThumb = keepVal === "thumb" || keepVal === "all"

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2v_"))
  const videoPathsForConcat: string[] = []
  let currentSpinner: Ora | null = null

  try {
    // Step 3: Synthesize TTS for pairs requiring it
    const ttsNeedPairs = result.pairs.filter((p): p is MediaPair & TTSItem =>
      Boolean(p.textPath && (!p.audioPath || options.force))
    )

    await synthesizeTTSForItems({
      items: ttsNeedPairs,
      getWavPath: (item) => {
        return path.join(
          keepAudio ? outputDir : tempDir,
          `${item.basename}.wav`
        )
      },
      force: options.force,
      model: options.model,
    })

    // Step 4: Render single video segments
    const renderSpinner = createSpinner("Rendering video segments...")
    currentSpinner = renderSpinner
    let renderedCount = 0
    let skippedCount = 0

    for (let i = 0; i < result.pairs.length; i++) {
      const pair = result.pairs[i]

      if (!pair.audioPath) {
        throw new Error(`Missing audio for pair "${pair.basename}"`)
      }

      const targetVideoPath = path.join(
        keepVideo ? outputDir : tempDir,
        `${pair.basename}.mp4`
      )

      if (keepVideo && fs.existsSync(targetVideoPath) && !options.force) {
        videoPathsForConcat.push(targetVideoPath)
        skippedCount++
        continue
      }

      const videoFilename = picocolors.cyan(path.basename(targetVideoPath))
      renderSpinner.text = `Rendering segment ${i + 1}/${result.pairs.length} (${videoFilename})...`

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
        renderSpinner.fail(
          `Verification failed for ${pair.basename}: ${verification.errors.join(", ")}`
        )
        process.exit(1)
      }

      videoPathsForConcat.push(targetVideoPath)
      renderedCount++
    }

    const renderParts: string[] = []
    if (renderedCount > 0)
      renderParts.push(picocolors.green(`${renderedCount} rendered`))
    if (skippedCount > 0)
      renderParts.push(picocolors.yellow(`${skippedCount} skipped`))
    const keepNote = keepVideo
      ? ` (${picocolors.cyan("kept in output directory")})`
      : ""
    renderSpinner.succeed(
      `Video segments: ${renderParts.join(", ") || "0 segments"}${keepNote}`
    )

    // Step 5: Select random background assets (video & music) from package root directory
    const bgVideoDir = path.resolve(pkgRootDir, CONFIG.DEFAULT_BG_VIDEO_DIR)
    const bgMusicDir = path.resolve(pkgRootDir, CONFIG.DEFAULT_BG_MUSIC_DIR)

    if (!fs.existsSync(bgVideoDir)) {
      fs.mkdirSync(bgVideoDir, { recursive: true })
    }
    if (!fs.existsSync(bgMusicDir)) {
      fs.mkdirSync(bgMusicDir, { recursive: true })
    }

    const randomBgVideo = getRandomMediaFile(
      bgVideoDir,
      CONFIG.SUPPORTED_VIDEO_EXTS
    )
    const randomBgMusic = getRandomMediaFile(
      bgMusicDir,
      CONFIG.SUPPORTED_AUDIO_EXTS
    )

    // Optional Step: Generate thumbnail image if t.txt exists in input directory
    let thumbOverlayPath: string | null = null
    if (result.titlePath && fs.existsSync(result.titlePath)) {
      const thumbSpinner = createSpinner("Generating thumbnail intro...")
      currentSpinner = thumbSpinner
      try {
        const titleText = fs.readFileSync(result.titlePath, "utf-8").trim()
        if (titleText) {
          const targetThumbPath = path.join(tempDir, "thumbnail_overlay.png")
          await generateThumbnailImage({
            titleText,
            outputPath: targetThumbPath,
          })
          thumbOverlayPath = targetThumbPath
          const titleFileName = path.basename(result.titlePath)
          thumbSpinner.succeed(
            `Thumbnail intro generated from ${picocolors.cyan(titleFileName)}`
          )
        } else {
          const titleFileName = path.basename(result.titlePath)
          thumbSpinner.info(
            `${titleFileName} is empty, skipping thumbnail generation`
          )
        }
      } catch (err: any) {
        thumbSpinner.warn(`Thumbnail generation skipped: ${err.message}`)
      }
    }

    // Step 6: Concatenate video clips into final output MP4 with background compositing
    const outputNameStr = picocolors.cyan(outputFileName)
    const concatSpinner = createSpinner(
      `Compositing ${videoPathsForConcat.length} clips into ${outputNameStr}...`
    )
    currentSpinner = concatSpinner

    if (randomBgVideo || randomBgMusic) {
      const bgParts: string[] = []
      if (randomBgVideo)
        bgParts.push(`BG: ${picocolors.cyan(path.basename(randomBgVideo))}`)
      if (randomBgMusic)
        bgParts.push(
          `Music: ${picocolors.magenta(path.basename(randomBgMusic))}`
        )
      concatSpinner.text = `Compositing clips onto ${bgParts.join(", ")}...`
    }

    await concatVideosWithGap({
      videoPaths: videoPathsForConcat,
      outputPath: finalOutputPath,
      bgVideoPath: randomBgVideo,
      bgMusicPath: randomBgMusic,
      thumbOverlayPath,
    })

    const elapsedTime = (Date.now() - startTime) / 1000
    const timeStr = picocolors.dim(` in ${elapsedTime.toFixed(2)}s`)
    concatSpinner.succeed(
      `Final video: ${picocolors.cyan(relFinalPath)}${timeStr}`
    )

    if (keepThumb) {
      const thumbJpgPath = path.join(
        outputDir,
        CONFIG.DEFAULT_THUMB_OUTPUT_FILENAME
      )
      const relThumbPath =
        path.relative(process.cwd(), thumbJpgPath) || thumbJpgPath
      try {
        await extractVideoFrame(finalOutputPath, thumbJpgPath, 0)
        console.log(
          `  ${picocolors.dim("├─")} Thumbnail: ${picocolors.yellow(relThumbPath)}`
        )
      } catch (thumbErr: any) {
        console.warn(
          picocolors.yellow(
            `  ${picocolors.dim("├─")} Failed to export thumbnail: ${thumbErr.message}`
          )
        )
      }
    }

    if (randomBgVideo && randomBgMusic) {
      console.log(
        `  ${picocolors.dim("├─")} BG Video: ${picocolors.cyan(path.basename(randomBgVideo))}`
      )
      console.log(
        `  ${picocolors.dim("└─")} BG Music: ${picocolors.magenta(path.basename(randomBgMusic))}`
      )
    } else if (randomBgVideo) {
      console.log(
        `  ${picocolors.dim("└─")} BG Video: ${picocolors.cyan(path.basename(randomBgVideo))}`
      )
    } else if (randomBgMusic) {
      console.log(
        `  ${picocolors.dim("└─")} BG Music: ${picocolors.magenta(path.basename(randomBgMusic))}`
      )
    }
  } catch (err: any) {
    if (currentSpinner && currentSpinner.isSpinning) {
      currentSpinner.fail(`Failed to build video: ${err.message}`)
    } else {
      console.error(picocolors.red(`✖ Failed to build video: ${err.message}`))
    }
    process.exit(1)
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

export async function ttsCommand({
  input,
  output,
  force,
  model,
}: TTSCommandOptions): Promise<void> {
  const inputDir = path.resolve(input)
  const outDir = path.resolve(output)

  let spinner = createSpinner(`Scanning input directory "${inputDir}"...`)

  try {
    const files = fs.readdirSync(inputDir)
    const textExts = new Set<string>(CONFIG.SUPPORTED_TEXT_EXTS)
    const ttsItems: TTSItem[] = []

    for (const file of files) {
      const fullPath = path.join(inputDir, file)
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) continue

      if (isIgnoredFile(file) || isTitleFile(file)) {
        continue
      }

      const ext = path.extname(file).toLowerCase()
      if (textExts.has(ext)) {
        const basename = path.basename(file, ext).toLowerCase()
        ttsItems.push({
          basename,
          textPath: fullPath,
        })
      }
    }

    if (ttsItems.length === 0) {
      spinner.text = "Checking text files..."
      const extsStr = CONFIG.SUPPORTED_TEXT_EXTS.join(", ")
      spinner.info(`No text files (${extsStr}) found in "${inputDir}".`)
      return
    }

    spinner.succeed(
      `Scanned input directory (${picocolors.cyan(ttsItems.length.toString())} text file(s) found)`
    )

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    const getWavPath = (item: TTSItem) =>
      path.join(outDir, `${item.basename}.wav`)

    await synthesizeTTSForItems({
      items: ttsItems,
      getWavPath,
      force,
      model,
    })
  } catch (err: any) {
    if (spinner.isSpinning) {
      spinner.fail(`TTS synthesis failed: ${err.message}`)
    } else {
      console.error(picocolors.red(`✖ TTS synthesis failed: ${err.message}`))
    }
    process.exit(1)
  }
}

export async function testTtsCommand({
  input,
  output,
  force,
}: TestTTSCommandOptions): Promise<void> {
  const modelsDir = path.resolve(__dirname, "../models")
  if (!fs.existsSync(modelsDir)) {
    console.error(picocolors.red("No models directory found."))
    process.exit(1)
  }

  const files = fs.readdirSync(modelsDir)
  const modelNames = files
    .filter((f) => f.endsWith(".onnx"))
    .map((f) => path.basename(f, ".onnx"))
    .sort()

  if (modelNames.length === 0) {
    console.error(
      picocolors.yellow("No TTS models found in models/ directory.")
    )
    process.exit(1)
  }

  console.log(picocolors.bold(`Testing ${modelNames.length} TTS models...`))

  for (const modelName of modelNames) {
    const modelOutDir = path.join(output, modelName)
    console.log(`\n--- Testing model: ${picocolors.cyan(modelName)} ---`)
    await ttsCommand({
      input,
      output: modelOutDir,
      force,
      model: modelName,
    })
  }
}
