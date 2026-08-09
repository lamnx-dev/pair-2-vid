export interface MediaPair {
  basename: string
  imagePath: string
  audioPath: string
  imageFileName: string
  audioFileName: string
  imageExt: string
  audioExt: string
  imageDimensions?: { width: number; height: number }
  audioDuration?: number
}

export interface ImageDimensionInfo {
  fileName: string
  basename: string
  width: number
  height: number
}

export interface ScanResult {
  pairs: MediaPair[]
  missingImages: string[] // audio file names without image
  missingAudios: string[] // image file names without audio
  duplicateImages: Map<string, string[]> // basename -> array of image file names
  duplicateAudios: Map<string, string[]> // basename -> array of audio file names
  imageDimensions: ImageDimensionInfo[]
  isValid: boolean
}

export interface BuildOptions {
  input: string
  output: string
  overwrite?: boolean
  keepSingles?: boolean
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
