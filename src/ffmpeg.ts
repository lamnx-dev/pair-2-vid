import { execa } from "execa"
import fs from "fs"
import path from "path"
import picocolors from "picocolors"
import { CONFIG } from "./config.js"
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
        "\nFFmpeg or FFprobe binaries from npm packages were not found"
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
  duration: number
): Promise<void> {
  const { ffmpegPath } = await checkFFmpegAvailability()
  const fps = 30

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

export async function getVideoDimensions(
  videoPath: string
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
    videoPath,
  ])

  const parts = stdout.trim().split(",")
  if (parts.length < 2) {
    throw new Error(`Failed to read dimensions for video "${videoPath}"`)
  }

  const width = parseInt(parts[0], 10)
  const height = parseInt(parts[1], 10)

  if (isNaN(width) || isNaN(height)) {
    throw new Error(`Invalid dimensions for video "${videoPath}": ${stdout}`)
  }

  return { width, height }
}

export async function concatVideosWithGap(
  videoPaths: string[],
  outputPath: string
): Promise<void> {
  if (videoPaths.length === 0) return

  const { ffmpegPath } = await checkFFmpegAvailability()
  const fps = 30
  const gapDuration = CONFIG.DEFAULT_GAP_DURATION
  const gapColor = "green"
  const defaultWidth = 1080
  const aspectWidth = 9
  const aspectHeight = 16

  // Ensure target directory exists
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Fetch dimensions for all input videos
  const allDims = await Promise.all(
    videoPaths.map((vPath) => getVideoDimensions(vPath))
  )

  // Standard width targetW (from first video or default 1080)
  const targetW =
    Math.floor((allDims[0]?.width || defaultWidth) / 2) * 2

  // Force strict aspect ratio canvas height (targetH = targetW * ASPECT_RATIO_HEIGHT / ASPECT_RATIO_WIDTH)
  const targetH =
    Math.floor(
      (targetW * aspectHeight) / aspectWidth / 2
    ) * 2

  const filterParts: string[] = []
  const concatInputs: string[] = []

  const ffmpegArgs: string[] = ["-y"]
  for (const vPath of videoPaths) {
    ffmpegArgs.push("-i", vPath)
  }

  for (let i = 0; i < videoPaths.length; i++) {
    // Scale width to targetW (fullwidth), pad top/bottom with green screen (gapColor) for aspect frame
    filterParts.push(
      `[${i}:v]scale=${targetW}:-2,pad=${targetW}:'max(ih,${targetH})':0:'(oh-ih)/2':color=${gapColor},crop=${targetW}:${targetH},setsar=1,format=yuv420p[v${i}]`
    )
    filterParts.push(
      `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`
    )

    concatInputs.push(`[v${i}][a${i}]`)

    if (i < videoPaths.length - 1 && gapDuration > 0) {
      filterParts.push(
        `color=c=${gapColor}:s=${targetW}x${targetH}:r=${fps}:d=${gapDuration.toFixed(6)},format=yuv420p,setsar=1[gapv${i}]`
      )
      filterParts.push(
        `anullsrc=r=44100:cl=stereo,atrim=duration=${gapDuration.toFixed(6)}[gapa${i}]`
      )
      concatInputs.push(`[gapv${i}][gapa${i}]`)
    }
  }

  const segmentCount = concatInputs.length
  filterParts.push(
    `${concatInputs.join("")}concat=n=${segmentCount}:v=1:a=1[outv][outa]`
  )

  const filterComplex = filterParts.join(";")

  ffmpegArgs.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-r",
    fps.toString(),
    outputPath
  )

  await execa(ffmpegPath, ffmpegArgs)
}
