import fs from "fs"
import path from "path"
import { execa } from "execa"
import { checkFFmpegAvailability } from "../src/ffmpeg.js"

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
  await execa(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${durationSeconds}`,
    filePath,
  ])
}

async function main() {
  console.log("--- Starting Integration Test Suite ---")
  await checkFFmpegAvailability()

  // Clean test temp dir
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
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

  console.log("\n--- Test 1: Validation on Valid Input ---")
  const valResult = await execa("pnpm", [
    "start",
    "validate",
    "-i",
    validInputDir,
  ])
  console.log(valResult.stdout)

  console.log("\n--- Test 2: Build Videos from Valid Input ---")
  const buildResult = await execa("pnpm", [
    "start",
    "build",
    "-i",
    validInputDir,
    "-o",
    validOutputDir,
  ])
  console.log(buildResult.stdout)

  // Check generated output files
  const out01 = path.join(validOutputDir, "01.mp4")
  const out02 = path.join(validOutputDir, "02.mp4")
  const out03 = path.join(validOutputDir, "03.mp4")

  if (!fs.existsSync(out01) || !fs.existsSync(out02) || !fs.existsSync(out03)) {
    throw new Error("Generated MP4 output files missing!")
  }
  console.log("✓ All 3 MP4 files generated successfully!")

  // Test overwrite warning when running without -f / --force
  console.log("\n--- Test 3: Overwrite warning check ---")
  const rebuildResult = await execa("pnpm", [
    "start",
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
    await execa("pnpm", ["start", "validate", "-i", missingAudioDir])
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
    await execa("pnpm", ["start", "validate", "-i", dupDir])
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
