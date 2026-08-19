// ============================================================================
// Scanner & Media Types
// ============================================================================

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
  titlePath?: string
  missingImages: string[] // audio or text file names without image
  missingAudios: string[] // image file names without audio or text
  duplicateImages: Map<string, string[]> // basename -> array of image file names
  duplicateAudios: Map<string, string[]> // basename -> array of audio file names
  imageDimensions: ImageDimensionInfo[]
}

// ============================================================================
// FFmpeg & Video Processing Types
// ============================================================================

export interface ConcatOptions {
  videoPaths: string[]
  outputPath: string
  bgVideoPath?: string | null
  bgMusicPath?: string | null
  thumbOverlayPath?: string | null
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

// ============================================================================
// ONNX & TTS Types
// ============================================================================

export interface TTSItem {
  basename: string
  textPath: string
  audioPath?: string
}

export interface OnnxTTSConfig {
  audio: {
    sample_rate: number
  }
  inference: {
    noise_scale: number
    length_scale: number
    noise_w: number
  }
  phoneme_id_map: Record<string, number[]>
}

export interface SynthesizeTTSOptions {
  items: TTSItem[]
  getWavPath: (item: TTSItem) => string
  force?: boolean
  model?: string
}

export interface SynthesizeTTSResult {
  synthesized: number
  skipped: number
}

// ============================================================================
// CLI & Builder Options Types
// ============================================================================

export interface BuildOptions {
  input: string
  output: string
  force?: boolean
  keep?: string | boolean
  model?: string
}

export interface TTSCommandOptions {
  input: string
  output: string
  force?: boolean
  model?: string
}

export interface TestTTSCommandOptions {
  input: string
  output: string
  force?: boolean
}
