export interface TTSItem {
  basename: string
  textPath: string
  audioPath?: string
}

export interface MediaPair {
  basename: string
  imagePath: string
  audioPath?: string
  textPath?: string
  imageDimensions?: { width: number; height: number }
}

export interface ImageDimensionInfo {
  fileName: string
  basename: string
  width: number
  height: number
}

export interface ScanResult {
  pairs: MediaPair[]
  missingImages: string[] // audio or text file names without image
  missingAudios: string[] // image file names without audio or text
  duplicateImages: Map<string, string[]> // basename -> array of image file names
  duplicateAudios: Map<string, string[]> // basename -> array of audio file names
  imageDimensions: ImageDimensionInfo[]
}

export interface BuildOptions {
  input: string
  output: string
  force?: boolean
  keep?: string
  model?: string
}

export interface VerificationResult {
  valid: boolean
  actualDuration: number
  expectedDuration: number
  actualWidth: number
  actualHeight: number
  expectedWidth: number
  expectedHeight: number
  hasVideoStream: boolean
  hasAudioStream: boolean
  errors: string[]
}
