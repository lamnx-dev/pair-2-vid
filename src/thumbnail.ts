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
 * Splits text into balanced lines using character lengths and circular/diamond target proportions:
 * - 1-2 short words: kept as 1 line
 * - 3 words: if short (<= 8 chars) kept as 1 line, if longer split into 2 lines
 * - 4 words: 2 lines
 * - 5-7 words: 3 lines (middle line wider, but constrained to max 1.35x of edge lines)
 * - 8-9 words: 4 lines
 * - Evaluates splits by character length to match target circular silhouette
 */
/**
 * Splits text into balanced lines using character lengths and circular/diamond target proportions:
 * - 1-2 words: 1 line (if under 12 chars), otherwise 2 lines
 * - 3-4 words: 2 lines
 * - 5 words: 2 lines if short (<= 18 chars), otherwise 3 lines
 * - 6-7 words: 3 lines
 * - 8-9 words: 4 lines
 * - Evaluates splits by character length to match target circular silhouette
 */
export function wrapTitleText(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ")
  if (!clean) return ""

  const words = clean.split(" ")
  if (words.length <= 1) {
    return clean
  }

  // 2 words: 1 line if <= 11 chars, otherwise wrap to 2 lines
  if (words.length === 2) {
    if (clean.length <= 11) {
      return clean
    }
  }

  const totalWords = words.length

  // Determine optimal line count
  let numLines: number
  if (totalWords === 2 || totalWords === 3 || totalWords === 4) {
    numLines = 2
  } else if (totalWords === 5) {
    // 5 words: if total text is short (<= 18 chars like "Tôi Đã Bị Lừa Rồi") -> 2 lines
    numLines = clean.length <= 18 ? 2 : 3
  } else if (totalWords >= 6 && totalWords <= 7) {
    numLines = 3
  } else if (totalWords >= 8 && totalWords <= 9) {
    numLines = 4
  } else {
    numLines = Math.max(2, Math.ceil(totalWords / 2.5))
  }

  // Ideal relative width ratio per line (circular shape: middle lines are wider than top/bottom)
  let idealRatios: number[]
  if (numLines === 2) {
    idealRatios = [1.0, 1.0]
  } else if (numLines === 3) {
    // Moderate diamond: 0.9 - 1.15 - 0.9
    idealRatios = [0.9, 1.15, 0.9]
  } else if (numLines === 4) {
    idealRatios = [0.8, 1.15, 1.15, 0.8]
  } else {
    idealRatios = Array.from({ length: numLines }, (_, i) => {
      const theta = (Math.PI * (i + 0.5)) / numLines
      return 0.7 + 0.5 * Math.sin(theta)
    })
  }

  // Calculate target character lengths per line
  const totalChars = clean.length
  const ratioSum = idealRatios.reduce((a, b) => a + b, 0)
  const targetLineLengths = idealRatios.map((r) => (r / ratioSum) * totalChars)

  // Generate all valid monotonic partitions of words into numLines (at least 1 word per line)
  function getPartitions(wordIdx: number, linesLeft: number): number[][] {
    const remainingWords = totalWords - wordIdx
    if (linesLeft === 1) {
      return remainingWords >= 1 ? [[remainingWords]] : []
    }

    const results: number[][] = []
    const maxWordsForThisLine = remainingWords - (linesLeft - 1)
    for (let count = 1; count <= maxWordsForThisLine; count++) {
      const subPartitions = getPartitions(wordIdx + count, linesLeft - 1)
      for (const sub of subPartitions) {
        results.push([count, ...sub])
      }
    }
    return results
  }

  const partitions = getPartitions(0, numLines)

  // Score each partition: minimize squared error to target line character lengths
  // Heavily penalize any partition where any line exceeds 15 characters (causing overflow in frame)
  let bestPartition: number[] = []
  let bestScore = Infinity

  for (const partition of partitions) {
    let score = 0
    let start = 0
    let maxLineCharCount = 0

    for (let i = 0; i < numLines; i++) {
      const count = partition[i]
      const lineStr = words.slice(start, start + count).join(" ")
      const charLen = lineStr.length
      const targetLen = targetLineLengths[i]
      score += Math.pow(charLen - targetLen, 2)

      if (charLen > maxLineCharCount) maxLineCharCount = charLen
      start += count
    }

    // Heavy penalty if any line is too long (> 13 chars gets progressive penalty)
    if (maxLineCharCount > 13) {
      score += Math.pow(maxLineCharCount - 13, 2) * 50
    }

    if (score < bestScore) {
      bestScore = score
      bestPartition = partition
    }
  }

  // Build the final lines from best partition
  const lines: string[] = []
  let startIndex = 0
  for (let i = 0; i < numLines; i++) {
    const count = bestPartition[i] || 1
    lines.push(words.slice(startIndex, startIndex + count).join(" "))
    startIndex += count
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
  const clean = titleText.trim().replace(/\s+/g, " ")
  const wordCount = clean.split(" ").length

  // Find the longest line by character length to dynamically adapt fontSize
  const maxLineLength = Math.max(...rawLines.map((l) => l.length))

  // Calculate dynamic font size based on number of lines and longest line length
  let fontSize = 130
  if (lineCount >= 4) {
    fontSize = maxLineLength >= 13 ? 80 : 86
  } else if (lineCount === 3) {
    // 3 lines: standard 104, if line is long reduce to 94-98
    if (maxLineLength >= 14) {
      fontSize = 92
    } else if (maxLineLength >= 12) {
      fontSize = 98
    } else {
      fontSize = 104
    }
  } else if (lineCount === 2) {
    // 2 lines: standard 118, if long reduce to 106-112
    if (maxLineLength >= 12) {
      fontSize = 108
    } else {
      fontSize = 118
    }
  } else {
    // 1 line:
    if (wordCount === 1) {
      // 1 single word:
      // Short word (<= 3 chars, e.g. "AI"): large font size (170)
      // Long word (>= 10 chars, e.g. "Microservices"): reduce font size to prevent overflow (110)
      if (clean.length <= 3) {
        fontSize = 175
      } else if (clean.length <= 7) {
        fontSize = 150
      } else {
        fontSize = Math.max(90, Math.round(1500 / clean.length))
      }
    } else {
      fontSize = 120
    }
  }

  const resolvedFont = resolveSystemFont()
  const fontFilePart = resolvedFont
    ? `fontfile='${resolvedFont.replace(/\\/g, "/").replace(/:/g, "\\:")}':`
    : ""

  const lineSpacing = Math.round(fontSize * 0.1)
  const lineStep = fontSize + lineSpacing

  const centerY = "(h/2)"
  const middleIndex = (lineCount - 1) / 2

  const filterChains = rawLines.map((line, index) => {
    const escapedText = line
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/%/g, "\\%")
      .replace(/'/g, "")

    const offsetFromCenter = (index - middleIndex) * lineStep
    const yExpr = `${centerY}+${offsetFromCenter}-ascent/2`

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
    "-threads",
    CONFIG.DEFAULT_FFMPEG_SEGMENT_THREADS.toString(),
    "-i",
    resolvedFramePath,
    "-vf",
    filterChains.join(","),
    outputPath,
  ])

  return outputPath
}
