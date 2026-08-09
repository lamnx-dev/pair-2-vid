import fs from "fs"
import path from "path"
import { getImageDimensions } from "./ffmpeg.js"
import { ImageDimensionInfo, MediaPair, ScanResult } from "./types.js"

const SUPPORTED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"])
const SUPPORTED_AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac"])

export async function scanInputDirectory(
  inputDir: string
): Promise<ScanResult> {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: "${inputDir}"`)
  }

  const files = fs.readdirSync(inputDir)

  const imagesByBasename = new Map<string, string[]>()
  const audiosByBasename = new Map<string, string[]>()

  for (const file of files) {
    const fullPath = path.join(inputDir, file)
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) continue

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

  // Find all unique basenames across images & audio
  const allBasenames = new Set([
    ...imagesByBasename.keys(),
    ...audiosByBasename.keys(),
  ])

  const pairs: MediaPair[] = []
  const missingImages: string[] = []
  const missingAudios: string[] = []

  for (const base of allBasenames) {
    const imgList = imagesByBasename.get(base) || []
    const audList = audiosByBasename.get(base) || []

    const hasDuplicate = imgList.length > 1 || audList.length > 1

    if (imgList.length === 0 && audList.length > 0) {
      for (const audFile of audList) {
        missingImages.push(audFile)
      }
    } else if (audList.length === 0 && imgList.length > 0) {
      for (const imgFile of imgList) {
        missingAudios.push(imgFile)
      }
    } else if (!hasDuplicate && imgList.length === 1 && audList.length === 1) {
      const imgFileName = imgList[0]
      const audFileName = audList[0]
      pairs.push({
        basename: base,
        imagePath: path.join(inputDir, imgFileName),
        audioPath: path.join(inputDir, audFileName),
        imageFileName: imgFileName,
        audioFileName: audFileName,
        imageExt: path.extname(imgFileName).toLowerCase(),
        audioExt: path.extname(audFileName).toLowerCase(),
      })
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
        fileName: pair.imageFileName,
        basename: pair.basename,
        width: dims.width,
        height: dims.height,
      })
    } catch {
      // If image reading fails, it will be caught during validation
    }
  }

  const isValid =
    missingImages.length === 0 &&
    missingAudios.length === 0 &&
    duplicateImages.size === 0 &&
    duplicateAudios.size === 0 &&
    pairs.length > 0

  return {
    pairs,
    missingImages,
    missingAudios,
    duplicateImages,
    duplicateAudios,
    imageDimensions: dimensionInfos,
    isValid,
  }
}
