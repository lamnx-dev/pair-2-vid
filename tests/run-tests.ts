import { execa } from "execa"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG } from "../src/config.js"
import { checkFFmpegAvailability, getAudioDuration } from "../src/ffmpeg.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRootDir = path.resolve(__dirname, "..")
const TEST_DIR = path.resolve("./test_temp")

async function createTestImage(
  filePath: string,
  width: number,
  height: number,
  color = "red"
) {
  const { ffmpegPath } = await checkFFmpegAvailability()
  await execa(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=${width}x${height}`,
    "-vframes",
    "1",
    filePath,
  ])
}

async function createTestAudio(filePath: string, durationSeconds: number) {
  const { ffmpegPath } = await checkFFmpegAvailability()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  await execa(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${durationSeconds}`,
    filePath,
  ])
}

async function createTestVideoBg(
  filePath: string,
  durationSeconds: number,
  width = 1080,
  height = 1920,
  color = "red"
) {
  const { ffmpegPath } = await checkFFmpegAvailability()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  await execa(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=${width}x${height}:d=${durationSeconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    filePath,
  ])
}

async function main() {
  console.log("--- Starting Integration Test Suite ---")
  await checkFFmpegAvailability()

  // Clean test temp dir
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  }
  fs.mkdirSync(TEST_DIR, { recursive: true })

  const validInputDir = path.join(TEST_DIR, "input_valid")
  const validOutputDir = path.join(TEST_DIR, "output_valid")
  fs.mkdirSync(validInputDir, { recursive: true })

  // 1. Create PNG + MP3 pair (01.png 1080x1920, 01.mp3 3.5s)
  await createTestImage(path.join(validInputDir, "01.png"), 1080, 1920, "blue")
  await createTestAudio(path.join(validInputDir, "01.mp3"), 3.5)

  // 2. Create JPG + MP3 pair (02.jpg 1080x1920, 02.mp3 5.0s)
  await createTestImage(path.join(validInputDir, "02.jpg"), 1080, 1920, "green")
  await createTestAudio(path.join(validInputDir, "02.mp3"), 5.0)

  // 3. Create JPEG + AAC pair (03.jpeg 1080x1920, 03.aac 2.2s)
  await createTestImage(
    path.join(validInputDir, "03.jpeg"),
    1080,
    1920,
    "purple"
  )
  await createTestAudio(path.join(validInputDir, "03.aac"), 2.2)

  // 4. Create WebP + TXT pair for TTS (04.webp 1080x1920, 04.txt)
  await createTestImage(
    path.join(validInputDir, "04.webp"),
    1080,
    1920,
    "yellow"
  )
  fs.writeFileSync(
    path.join(validInputDir, "04.txt"),
    "Xin chào các bạn đây là video thử nghiệm tts từ file văn bản",
    "utf-8"
  )

  console.log("\n--- Test 1: Validation on Valid Input ---")
  const valResult = await execa("npx", [
    "tsx",
    "src/cli.ts",
    "validate",
    "-i",
    validInputDir,
  ])
  console.log(valResult.stdout)

  console.log("\n--- Test 2: Build Videos from Valid Input ---")
  const buildResult = await execa("npx", [
    "tsx",
    "src/cli.ts",
    "build",
    "-i",
    validInputDir,
    "-o",
    validOutputDir,
    "-k",
    "video",
  ])
  console.log(buildResult.stdout)

  // Check generated output files in output directory
  const out01 = path.join(validOutputDir, "01.mp4")
  const out02 = path.join(validOutputDir, "02.mp4")
  const out03 = path.join(validOutputDir, "03.mp4")
  const out04 = path.join(validOutputDir, "04.mp4")

  if (
    !fs.existsSync(out01) ||
    !fs.existsSync(out02) ||
    !fs.existsSync(out03) ||
    !fs.existsSync(out04)
  ) {
    throw new Error(
      "Generated single MP4 output files missing in output directory!"
    )
  }
  console.log(
    "✓ All 4 single MP4 files (including TTS pair) generated successfully!"
  )

  const contentMp4 = path.join(validOutputDir, CONFIG.DEFAULT_OUTPUT_FILENAME)
  if (!fs.existsSync(contentMp4)) {
    throw new Error(`Generated ${CONFIG.DEFAULT_OUTPUT_FILENAME} missing!`)
  }
  const contentDuration = await getAudioDuration(contentMp4)
  console.log(
    `✓ Concatenated ${CONFIG.DEFAULT_OUTPUT_FILENAME} generated successfully (Duration: ${contentDuration.toFixed(2)}s)!`
  )

  const dur01 = await getAudioDuration(out01)
  const dur02 = await getAudioDuration(out02)
  const dur03 = await getAudioDuration(out03)
  const dur04 = await getAudioDuration(out04)

  // Expected total duration: sum of 4 clips + 3 internal gaps (0.3s each) + head gap (0.3s) + tail gap (0.3s)
  const expectedTotalDuration =
    dur01 + dur02 + dur03 + dur04 + 5 * CONFIG.DEFAULT_GAP_DURATION
  if (Math.abs(contentDuration - expectedTotalDuration) > 0.5) {
    throw new Error(
      `Concatenated video duration mismatch: Expected ~${expectedTotalDuration.toFixed(2)}s, got ${contentDuration}s`
    )
  }

  console.log(
    "\n--- Test 2b: Build Videos with Video BG & BG Music Repositories ---"
  )
  const defaultBgVideoDir = path.resolve(pkgRootDir, "assets/bg_videos")
  const defaultBgMusicDir = path.resolve(pkgRootDir, "assets/bg_music")

  const repoOutputDir = path.join(TEST_DIR, "output_repos")

  await createTestVideoBg(
    path.join(defaultBgVideoDir, "sample_bg.mp4"),
    4.0,
    1080,
    1920,
    "teal"
  )
  await createTestAudio(path.join(defaultBgMusicDir, "sample_music.mp3"), 6.0)

  const repoBuildResult = await execa("npx", [
    "tsx",
    "src/cli.ts",
    "build",
    "-i",
    validInputDir,
    "-o",
    repoOutputDir,
    "-f",
  ])

  console.log(repoBuildResult.stdout)

  const repoFinalMp4 = path.join(repoOutputDir, CONFIG.DEFAULT_OUTPUT_FILENAME)
  if (!fs.existsSync(repoFinalMp4)) {
    throw new Error(
      `Generated output.mp4 missing for Video BG + BG Music test!`
    )
  }
  const repoFinalDuration = await getAudioDuration(repoFinalMp4)
  console.log(
    `✓ Video BG + BG Music output.mp4 generated successfully (Duration: ${repoFinalDuration.toFixed(2)}s)!`
  )

  // Clean up created sample files in assets/
  if (fs.existsSync(path.join(defaultBgVideoDir, "sample_bg.mp4"))) {
    fs.rmSync(path.join(defaultBgVideoDir, "sample_bg.mp4"))
  }
  if (fs.existsSync(path.join(defaultBgMusicDir, "sample_music.mp3"))) {
    fs.rmSync(path.join(defaultBgMusicDir, "sample_music.mp3"))
  }

  // Test overwrite warning when running without -f / --force
  console.log("\n--- Test 3: Overwrite warning check ---")
  const rebuildResult = await execa("npx", [
    "tsx",
    "src/cli.ts",
    "build",
    "-i",
    validInputDir,
    "-o",
    validOutputDir,
  ])
  console.log(rebuildResult.stdout)

  // Test missing audio error handling
  console.log("\n--- Test 4: Missing Audio Detection ---")
  const missingAudioDir = path.join(TEST_DIR, "missing_audio")
  fs.mkdirSync(missingAudioDir, { recursive: true })
  await createTestImage(path.join(missingAudioDir, "99.png"), 1080, 1920)

  try {
    await execa("npx", ["tsx", "src/cli.ts", "validate", "-i", missingAudioDir])
    throw new Error("Validation should have failed for missing audio!")
  } catch (err: any) {
    console.log("✓ Correctly failed validation for missing audio:")
    console.log(err.stdout || err.stderr || err.message)
  }

  // Test duplicate image error handling
  console.log("\n--- Test 5: Duplicate Image Basename Detection ---")
  const dupDir = path.join(TEST_DIR, "dup_image")
  fs.mkdirSync(dupDir, { recursive: true })
  await createTestImage(path.join(dupDir, "01.png"), 1080, 1920)
  await createTestImage(path.join(dupDir, "01.jpg"), 1080, 1920)
  await createTestAudio(path.join(dupDir, "01.mp3"), 2.0)

  try {
    await execa("npx", ["tsx", "src/cli.ts", "validate", "-i", dupDir])
    throw new Error(
      "Validation should have failed for duplicate image basename!"
    )
  } catch (err: any) {
    console.log("✓ Correctly failed validation for duplicate image basename:")
    console.log(err.stdout || err.stderr || err.message)
  }

  // Cleanup test directory
  fs.rmSync(TEST_DIR, { recursive: true, force: true })

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")
}

main().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
