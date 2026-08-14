import { execa } from "execa"
import fs from "fs"
import path from "path"
import picocolors from "picocolors"
import { CONFIG } from "./config.js"
import { ConcatOptions, VerificationResult } from "./types/index.js"

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
    "-preset",
    "ultrafast",
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
    "-threads",
    "0",
    "-t",
    duration.toFixed(6),
    "-shortest",
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

export async function getVideoDuration(videoPath: string): Promise<number> {
  const { ffprobePath } = await checkFFmpegAvailability()

  const { stdout } = await execa(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ])

  const duration = parseFloat(stdout.trim())
  if (isNaN(duration) || duration <= 0) {
    throw new Error(
      `Invalid video duration extracted for "${videoPath}": ${stdout}`
    )
  }
  return duration
}

function calculateRandomStartOffset(
  assetDuration: number,
  targetDuration: number,
  minOffset: number = CONFIG.MIN_BG_START_OFFSET
): number {
  if (assetDuration <= minOffset) {
    return 0
  }
  const maxPossibleOffset =
    assetDuration > targetDuration
      ? assetDuration - targetDuration
      : assetDuration - 1
  const upperLimit = Math.max(minOffset, maxPossibleOffset)
  if (upperLimit <= minOffset) {
    return minOffset
  }
  return minOffset + Math.random() * (upperLimit - minOffset)
}

export async function concatVideosWithGap(
  options: ConcatOptions
): Promise<void> {
  const { videoPaths, outputPath, thumbOverlayPath, bgVideoPath, bgMusicPath } =
    options
  if (videoPaths.length === 0) return

  const { ffmpegPath } = await checkFFmpegAvailability()

  const gapDuration = CONFIG.DEFAULT_GAP_DURATION
  const bgMusicVol = CONFIG.DEFAULT_BG_MUSIC_VOLUME
  const fgScaleRatio = CONFIG.DEFAULT_FG_SCALE

  const thumbDuration =
    thumbOverlayPath && fs.existsSync(thumbOverlayPath)
      ? CONFIG.DEFAULT_THUMB_DURATION
      : 0

  const fps = 30
  const targetW = 1080
  const targetH = 1920

  const fgW = Math.floor((targetW * fgScaleRatio) / 2) * 2
  const fgH = Math.floor((targetH * fgScaleRatio) / 2) * 2

  // Ensure target directory exists
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Calculate durations for each video clip
  const clipDurations = await Promise.all(
    videoPaths.map((vPath) => getVideoDuration(vPath))
  )
  const totalClipsDuration = clipDurations.reduce((sum, d) => sum + d, 0)
  const totalInternalGaps = Math.max(0, videoPaths.length - 1) * gapDuration
  const bodyDuration = totalClipsDuration + totalInternalGaps
  const totalFinalDuration =
    thumbDuration + gapDuration + bodyDuration + gapDuration

  const ffmpegArgs: string[] = ["-y"]

  // Add foreground clips
  for (const vPath of videoPaths) {
    ffmpegArgs.push("-i", vPath)
  }

  let nextInputIdx = videoPaths.length
  let bgvIdx: number | null = null
  let bgmIdx: number | null = null
  let thumbIdx: number | null = null

  if (bgVideoPath && fs.existsSync(bgVideoPath)) {
    let offset = 0
    try {
      const bgvDuration = await getVideoDuration(bgVideoPath)
      offset = calculateRandomStartOffset(bgvDuration, totalFinalDuration)
    } catch {
      offset = 0
    }
    if (offset > 0) {
      ffmpegArgs.push("-ss", offset.toFixed(3))
    }
    ffmpegArgs.push(
      "-t",
      totalFinalDuration.toFixed(6),
      "-stream_loop",
      "-1",
      "-i",
      bgVideoPath
    )
    bgvIdx = nextInputIdx++
  }

  if (bgMusicPath && fs.existsSync(bgMusicPath)) {
    ffmpegArgs.push(
      "-t",
      totalFinalDuration.toFixed(6),
      "-stream_loop",
      "-1",
      "-i",
      bgMusicPath
    )
    bgmIdx = nextInputIdx++
  }

  if (thumbDuration > 0 && thumbOverlayPath) {
    ffmpegArgs.push(
      "-loop",
      "1",
      "-t",
      thumbDuration.toFixed(6),
      "-i",
      thumbOverlayPath
    )
    thumbIdx = nextInputIdx++
  }

  const filterParts: string[] = []
  const concatInputs: string[] = []

  for (let i = 0; i < videoPaths.length; i++) {
    filterParts.push(
      `[${i}:v]scale=${fgW}:${fgH}:force_original_aspect_ratio=decrease,pad=${fgW}:${fgH}:'(ow-iw)/2':'(oh-ih)/2':color=black@0,setsar=1,format=yuva420p[fgv${i}]`
    )
    filterParts.push(
      `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[fga${i}]`
    )
    concatInputs.push(`[fgv${i}][fga${i}]`)

    if (i < videoPaths.length - 1 && gapDuration > 0) {
      filterParts.push(
        `color=c=black@0:s=${fgW}x${fgH}:r=${fps}:d=${gapDuration.toFixed(6)},format=yuva420p,setsar=1[fggapv${i}]`
      )
      filterParts.push(
        `anullsrc=r=44100:cl=stereo,atrim=duration=${gapDuration.toFixed(6)}[fggapa${i}]`
      )
      concatInputs.push(`[fggapv${i}][fggapa${i}]`)
    }
  }

  const segmentCount = concatInputs.length
  filterParts.push(
    `${concatInputs.join("")}concat=n=${segmentCount}:v=1:a=1[fgv_raw][fga_raw]`
  )

  const headDelaySec = thumbDuration + gapDuration
  const headDelayMs = Math.round(headDelaySec * 1000)
  if (headDelayMs > 0) {
    filterParts.push(
      `[fga_raw]adelay=delays=${headDelayMs}|${headDelayMs}[fga_delayed]`
    )
  } else {
    filterParts.push(`[fga_raw]anull[fga_delayed]`)
  }

  if (bgvIdx !== null) {
    filterParts.push(
      `[${bgvIdx}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1,format=yuv420p[bgv_base]`
    )
  } else {
    filterParts.push(
      `color=c=green:s=${targetW}x${targetH}:r=${fps},format=yuv420p,setsar=1[bgv_base]`
    )
  }

  let currentV = "bgv_base"

  if (thumbIdx !== null) {
    if (CONFIG.DEFAULT_THUMB_BLUR_RADIUS > 0) {
      filterParts.push(
        `[bgv_base]avgblur=sizeX=${CONFIG.DEFAULT_THUMB_BLUR_RADIUS}:sizeY=${CONFIG.DEFAULT_THUMB_BLUR_RADIUS}:enable='between(t,0,${thumbDuration.toFixed(6)})'[bgv_blurred]`
      )
      currentV = "bgv_blurred"
    }

    filterParts.push(
      `[${thumbIdx}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:'(ow-iw)/2':'(oh-ih)/2':color=black@0,setsar=1,format=yuva420p[thumb_scaled]`
    )
    filterParts.push(
      `[${currentV}][thumb_scaled]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:enable='between(t,0,${thumbDuration.toFixed(6)})':shortest=0[bgv_with_thumb]`
    )
    currentV = "bgv_with_thumb"
  }

  filterParts.push(
    `[fgv_raw]setpts=PTS+${headDelaySec.toFixed(6)}/TB[fgv_shifted]`
  )
  filterParts.push(
    `[${currentV}][fgv_shifted]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:eof_action=pass[outv_raw]`
  )
  filterParts.push(
    `[outv_raw]trim=duration=${totalFinalDuration.toFixed(6)},setpts=PTS-STARTPTS[outv]`
  )

  filterParts.push(
    `[fga_delayed]apad,atrim=duration=${totalFinalDuration.toFixed(6)},asetpts=PTS-STARTPTS[speech_a]`
  )

  if (bgmIdx !== null) {
    filterParts.push(
      `[${bgmIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${bgMusicVol},atrim=duration=${totalFinalDuration.toFixed(6)},asetpts=PTS-STARTPTS[bgm_a]`
    )
    filterParts.push(
      `[speech_a][bgm_a]amix=inputs=2:duration=first:dropout_transition=0:weights='1 1',atrim=duration=${totalFinalDuration.toFixed(6)}[outa]`
    )
  } else {
    filterParts.push(`[speech_a]anull[outa]`)
  }

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
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-r",
    fps.toString(),
    "-threads",
    "0",
    "-t",
    totalFinalDuration.toFixed(6),
    outputPath
  )

  await execa(ffmpegPath, ffmpegArgs)
}

/**
 * Extracts a single frame (e.g. first frame at 00:00:00) from a video file as JPEG
 */
export async function extractVideoFrame(
  videoPath: string,
  outputPath: string,
  timeOffsetSec: number = 0
): Promise<void> {
  const { ffmpegPath } = await checkFFmpegAvailability()

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  await execa(ffmpegPath, [
    "-y",
    "-ss",
    timeOffsetSec.toFixed(3),
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    outputPath,
  ])
}
