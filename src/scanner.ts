import fs from "fs"
import path from "path"
import { CONFIG } from "./config.js"
import { getImageDimensions } from "./ffmpeg.js"
import { ImageDimensionInfo, MediaPair, ScanResult } from "./types/index.js"

const SUPPORTED_IMAGE_EXTS = new Set<string>(CONFIG.SUPPORTED_IMAGE_EXTS)
const SUPPORTED_AUDIO_EXTS = new Set<string>(CONFIG.SUPPORTED_AUDIO_EXTS)
const SUPPORTED_TEXT_EXTS = new Set<string>(CONFIG.SUPPORTED_TEXT_EXTS)

export function isIgnoredFile(filename: string): boolean {
  return CONFIG.IGNORED_PREFIXES.some((prefix) => filename.startsWith(prefix))
}

export function isTitleFile(filename: string): boolean {
  return filename.toLowerCase() === CONFIG.DEFAULT_TITLE_FILENAME.toLowerCase()
}

export async function scanInputDirectory(
  inputDir: string
): Promise<ScanResult> {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: "${inputDir}"`)
  }

  const files = fs.readdirSync(inputDir)

  let titlePath: string | undefined

  const imagesByBasename = new Map<string, string[]>()
  const audiosByBasename = new Map<string, string[]>()
  const textsByBasename = new Map<string, string[]>()

  for (const file of files) {
    const fullPath = path.join(inputDir, file)
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) continue

    if (isIgnoredFile(file)) {
      continue
    }

    if (isTitleFile(file)) {
      titlePath = fullPath
      continue
    }

    const ext = path.extname(file).toLowerCase()
    const basename = path.basename(file, path.extname(file)).toLowerCase()

    if (SUPPORTED_IMAGE_EXTS.has(ext)) {
      const existing = imagesByBasename.get(basename) || []
      existing.push(file)
      imagesByBasename.set(basename, existing)
    } else if (SUPPORTED_AUDIO_EXTS.has(ext)) {
      const existing = audiosByBasename.get(basename) || []
      existing.push(file)
      audiosByBasename.set(basename, existing)
    } else if (SUPPORTED_TEXT_EXTS.has(ext)) {
      const existing = textsByBasename.get(basename) || []
      existing.push(file)
      textsByBasename.set(basename, existing)
    }
  }

  const duplicateImages = new Map<string, string[]>()
  const duplicateAudios = new Map<string, string[]>()

  for (const [base, imgList] of imagesByBasename.entries()) {
    if (imgList.length > 1) {
      duplicateImages.set(base, imgList)
    }
  }

  for (const [base, audList] of audiosByBasename.entries()) {
    if (audList.length > 1) {
      duplicateAudios.set(base, audList)
    }
  }

  // Find all unique basenames across images, audio & text
  const allBasenames = new Set([
    ...imagesByBasename.keys(),
    ...audiosByBasename.keys(),
    ...textsByBasename.keys(),
  ])

  const pairs: MediaPair[] = []
  const missingImages: string[] = []
  const missingAudios: string[] = []

  for (const base of allBasenames) {
    const imgList = imagesByBasename.get(base) || []
    const audList = audiosByBasename.get(base) || []
    const txtList = textsByBasename.get(base) || []

    const hasDuplicateImageOrAudio = imgList.length > 1 || audList.length > 1

    if (imgList.length === 0 && (audList.length > 0 || txtList.length > 0)) {
      for (const audFile of audList) {
        missingImages.push(audFile)
      }
      for (const txtFile of txtList) {
        if (!audList.includes(txtFile)) {
          missingImages.push(txtFile)
        }
      }
    } else if (
      audList.length === 0 &&
      txtList.length === 0 &&
      imgList.length > 0
    ) {
      for (const imgFile of imgList) {
        missingAudios.push(imgFile)
      }
    } else if (!hasDuplicateImageOrAudio && imgList.length === 1) {
      const imgFileName = imgList[0]
      const pair: MediaPair = {
        basename: base,
        imagePath: path.join(inputDir, imgFileName),
      }

      if (audList.length === 1) {
        pair.audioPath = path.join(inputDir, audList[0])
        if (txtList.length === 1) {
          pair.textPath = path.join(inputDir, txtList[0])
        }
        pairs.push(pair)
      } else if (audList.length === 0 && txtList.length === 1) {
        pair.textPath = path.join(inputDir, txtList[0])
        pairs.push(pair)
      }
    }
  }

  // Sort pairs by basename for consistent ordering
  pairs.sort((a, b) => a.basename.localeCompare(b.basename))

  // Check image dimensions for valid pairs
  const dimensionInfos: ImageDimensionInfo[] = []
  for (const pair of pairs) {
    try {
      const dims = await getImageDimensions(pair.imagePath)
      pair.imageDimensions = dims
      dimensionInfos.push({
        fileName: path.basename(pair.imagePath),
        basename: pair.basename,
        width: dims.width,
        height: dims.height,
      })
    } catch {
      // If image reading fails, it will be caught during validation
    }
  }

  return {
    pairs,
    titlePath,
    missingImages,
    missingAudios,
    duplicateImages,
    duplicateAudios,
    imageDimensions: dimensionInfos,
  }
}

export function getRandomMediaFile(
  dirPath: string,
  supportedExts: readonly string[]
): string | null {
  if (!fs.existsSync(dirPath)) return null

  const extsSet = new Set(supportedExts.map((e) => e.toLowerCase()))
  const files = fs.readdirSync(dirPath).filter((f) => {
    const fullPath = path.join(dirPath, f)
    if (!fs.statSync(fullPath).isFile()) return false
    if (isIgnoredFile(f)) return false
    return extsSet.has(path.extname(f).toLowerCase())
  })

  if (files.length === 0) return null

  const randomIndex = Math.floor(Math.random() * files.length)
  return path.join(dirPath, files[randomIndex])
}
