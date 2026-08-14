import { execa } from "execa"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG } from "./config.js"
import { checkFFmpegAvailability } from "./ffmpeg.js"

export interface GenerateThumbnailOptions {
  titleText: string
  outputPath: string
}

/**
 * Automatically resolves a suitable font:
 * 1. Checks project bundled font (CONFIG.DEFAULT_THUMB_FONT_PATH)
 * 2. Fallbacks to OS system fonts (Windows, Linux, macOS)
 */
function resolveSystemFont(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const pkgRootDir = path.resolve(moduleDir, "..")

  // 1. Check bundled project font first (Quicksand-Bold)
  if (CONFIG.DEFAULT_THUMB_FONT_PATH) {
    const pkgFontPath = path.resolve(pkgRootDir, CONFIG.DEFAULT_THUMB_FONT_PATH)
    if (fs.existsSync(pkgFontPath)) return pkgFontPath
  }

  const isWindows = process.platform === "win32"
  const isDarwin = process.platform === "darwin"

  if (isWindows) {
    const winCandidates = [
      "C:/Windows/Fonts/segoeuib.ttf",
      "C:/Windows/Fonts/arialbd.ttf",
      "C:/Windows/Fonts/calibrib.ttf",
      "C:/Windows/Fonts/tahoma.ttf",
    ]
    for (const p of winCandidates) {
      if (fs.existsSync(p)) return p
    }
  } else if (isDarwin) {
    const macCandidates = [
      "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
      "/System/Library/Fonts/Helvetica.ttc",
      "/Library/Fonts/Arial.ttf",
    ]
    for (const p of macCandidates) {
      if (fs.existsSync(p)) return p
    }
  } else {
    // Linux / Ubuntu / Debian / Alpine
    const linuxCandidates = [
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
      "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for (const p of linuxCandidates) {
      if (fs.existsSync(p)) return p
    }
  }

  return null
}

/**
 * Splits text into balanced lines with 2-3 words per line, ideal for thumbnail layout
 */
export function wrapTitleText(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ")
  if (!clean) return ""

  const words = clean.split(" ")
  if (words.length <= 3) {
    return clean
  }

  const totalWords = words.length
  // Calculate target line count so each line contains ~2 to 3 words
  const numLines = Math.max(2, Math.ceil(totalWords / 3))
  const baseWordsPerLine = Math.floor(totalWords / numLines)
  const remainder = totalWords % numLines

  const lines: string[] = []
  let startIndex = 0
  for (let i = 0; i < numLines; i++) {
    const lineWordCount = baseWordsPerLine + (i < remainder ? 1 : 0)
    lines.push(words.slice(startIndex, startIndex + lineWordCount).join(" "))
    startIndex += lineWordCount
  }

  return lines.join("\n")
}

/**
 * Generates thumbnail PNG with text overlaid inside the flower frame
 */
export async function generateThumbnailImage({
  titleText,
  outputPath,
}: GenerateThumbnailOptions): Promise<string> {
  const { ffmpegPath } = await checkFFmpegAvailability()

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const pkgRootDir = path.resolve(moduleDir, "..")
  const resolvedFramePath = path.resolve(
    pkgRootDir,
    CONFIG.DEFAULT_THUMB_FRAME_PATH
  )

  if (!fs.existsSync(resolvedFramePath)) {
    throw new Error(`Thumbnail frame image not found at "${resolvedFramePath}"`)
  }

  const wrappedText = wrapTitleText(titleText)
  const rawLines = wrappedText.split("\n").filter((l) => l.trim().length > 0)
  const lineCount = rawLines.length

  // Calculate dynamic larger font size based on number of lines
  let fontSize = 96
  let lineSpacing = 24
  if (lineCount >= 4) {
    fontSize = 76
    lineSpacing = 18
  } else if (lineCount === 3) {
    fontSize = 92
    lineSpacing = 22
  } else if (lineCount === 2) {
    fontSize = 104
    lineSpacing = 26
  } else {
    fontSize = 112
    lineSpacing = 0
  }

  const resolvedFont = resolveSystemFont()
  const fontFilePart = resolvedFont
    ? `fontfile='${resolvedFont.replace(/\\/g, "/").replace(/:/g, "\\:")}':`
    : ""

  const totalLineHeight = fontSize + lineSpacing
  const totalBlockHeight =
    lineCount * fontSize + Math.max(0, lineCount - 1) * lineSpacing

  // Chain drawtext filters for each line so each individual line is perfectly centered horizontally
  const filterChains = rawLines.map((line, index) => {
    const escapedText = line
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/%/g, "\\%")
      .replace(/'/g, "")

    const yExpr = `(h-${totalBlockHeight})/2+${index * totalLineHeight}`

    return (
      `drawtext=${fontFilePart}` +
      `text='${escapedText}':` +
      `fontcolor=${CONFIG.DEFAULT_THUMB_TEXT_COLOR}:` +
      `fontsize=${fontSize}:` +
      `x=(w-text_w)/2:` +
      `y=${yExpr}:` +
      `shadowcolor=white@0.4:` +
      `shadowx=2:` +
      `shadowy=2`
    )
  })

  await execa(ffmpegPath, [
    "-y",
    "-i",
    resolvedFramePath,
    "-vf",
    filterChains.join(","),
    outputPath,
  ])

  return outputPath
}
