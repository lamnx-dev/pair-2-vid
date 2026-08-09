import { execa } from "execa"
import fs from "fs"
import path from "path"
import picocolors from "picocolors"
import { VerificationResult } from "./types.js"

let resolvedFfmpegPath: string | null = null
let resolvedFfprobePath: string | null = null

async function getExecutablePath(
  command: "ffmpeg" | "ffprobe"
): Promise<string | null> {
  try {
    if (command === "ffmpeg") {
      const ffmpegPkg = await import("@ffmpeg-installer/ffmpeg")
      if (ffmpegPkg.default?.path && fs.existsSync(ffmpegPkg.default.path)) {
        return ffmpegPkg.default.path
      }
    } else {
      const ffprobePkg = await import("@ffprobe-installer/ffprobe")
      if (ffprobePkg.default?.path && fs.existsSync(ffprobePkg.default.path)) {
        return ffprobePkg.default.path
      }
    }
  } catch {
    // Package not available or failed
  }

  return null
}

export async function checkFFmpegAvailability(): Promise<{
  ffmpegPath: string
  ffprobePath: string
}> {
  if (resolvedFfmpegPath && resolvedFfprobePath) {
    return { ffmpegPath: resolvedFfmpegPath, ffprobePath: resolvedFfprobePath }
  }

  const ffmpeg = await getExecutablePath("ffmpeg")
  const ffprobe = await getExecutablePath("ffprobe")

  if (!ffmpeg || !ffprobe) {
    console.error(
      picocolors.red(
        "\nFFmpeg or FFprobe binaries from npm packages were not found."
      )
    )
    console.error(
      "\nPlease ensure @ffmpeg-installer/ffmpeg and @ffprobe-installer/ffprobe are properly installed.\n"
    )
    process.exit(1)
  }

  resolvedFfmpegPath = ffmpeg
  resolvedFfprobePath = ffprobe
  return { ffmpegPath: ffmpeg, ffprobePath: ffprobe }
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  const { ffprobePath } = await checkFFmpegAvailability()

  const { stdout } = await execa(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ])

  const duration = parseFloat(stdout.trim())
  if (isNaN(duration) || duration <= 0) {
    throw new Error(
      `Invalid audio duration extracted for "${audioPath}": ${stdout}`
    )
  }
  return duration
}

export async function getImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number }> {
  const { ffprobePath } = await checkFFmpegAvailability()

  const { stdout } = await execa(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    imagePath,
  ])

  const parts = stdout.trim().split(",")
  if (parts.length < 2) {
    throw new Error(`Failed to read dimensions for image "${imagePath}"`)
  }

  const width = parseInt(parts[0], 10)
  const height = parseInt(parts[1], 10)

  if (isNaN(width) || isNaN(height)) {
    throw new Error(`Invalid dimensions for image "${imagePath}": ${stdout}`)
  }

  return { width, height }
}

export async function renderVideo(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  duration: number,
  options: { fps?: number } = {}
): Promise<void> {
  const { ffmpegPath } = await checkFFmpegAvailability()
  const fps = options.fps ?? 30

  // Ensure target directory exists
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // FFmpeg command to loop single image for exact audio duration
  // Output format: H.264 + AAC, yuv420p
  // Note: scale=trunc(iw/2)*2:trunc(ih/2)*2 ensures width and height are even numbers (divisible by 2)
  // required by H.264 yuv420p encoder.
  await execa(ffmpegPath, [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioPath,
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-r",
    fps.toString(),
    "-t",
    duration.toFixed(6),
    outputPath,
  ])
}

export async function verifyVideo(
  videoPath: string,
  expectedDuration: number,
  expectedWidth: number,
  expectedHeight: number
): Promise<VerificationResult> {
  const { ffprobePath } = await checkFFmpegAvailability()
  const errors: string[] = []

  if (!fs.existsSync(videoPath)) {
    return {
      valid: false,
      actualDuration: 0,
      expectedDuration,
      actualWidth: 0,
      actualHeight: 0,
      expectedWidth,
      expectedHeight,
      hasVideoStream: false,
      hasAudioStream: false,
      errors: [`Output video file does not exist: ${videoPath}`],
    }
  }

  const { stdout } = await execa(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height:format=duration",
    "-of",
    "json",
    videoPath,
  ])

  const probeData = JSON.parse(stdout)
  const streams = probeData.streams || []
  const format = probeData.format || {}

  const videoStream = streams.find((s: any) => s.codec_type === "video")
  const audioStream = streams.find((s: any) => s.codec_type === "audio")

  const hasVideoStream = Boolean(videoStream)
  const hasAudioStream = Boolean(audioStream)

  if (!hasVideoStream) {
    errors.push("Missing video stream in generated MP4")
  }
  if (!hasAudioStream) {
    errors.push("Missing audio stream in generated MP4")
  }

  const actualWidth = videoStream?.width ? parseInt(videoStream.width, 10) : 0
  const actualHeight = videoStream?.height
    ? parseInt(videoStream.height, 10)
    : 0
  const actualDuration = format.duration ? parseFloat(format.duration) : 0

  const targetWidth = Math.floor(expectedWidth / 2) * 2
  const targetHeight = Math.floor(expectedHeight / 2) * 2

  if (actualWidth !== targetWidth || actualHeight !== targetHeight) {
    errors.push(
      `Dimension mismatch: expected ${targetWidth}x${targetHeight}, got ${actualWidth}x${actualHeight}`
    )
  }

  // Duration tolerance check (0.2s allowed due to container/frame rate timebase rounding)
  const durationDiff = Math.abs(actualDuration - expectedDuration)
  if (durationDiff > 0.2) {
    errors.push(
      `Duration mismatch: Expected ${expectedDuration.toFixed(3)}s, Actual ${actualDuration.toFixed(3)}s`
    )
  }

  return {
    valid: errors.length === 0,
    actualDuration,
    expectedDuration,
    actualWidth,
    actualHeight,
    expectedWidth,
    expectedHeight,
    hasVideoStream,
    hasAudioStream,
    errors,
  }
}
