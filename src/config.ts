export const CONFIG = {
  // Directory & File Defaults
  DEFAULT_INPUT_DIR: ".",
  DEFAULT_OUTPUT_DIR: ".",
  DEFAULT_OUTPUT_FILENAME: "output.mp4",

  // Gap / Transition Settings
  DEFAULT_GAP_DURATION: 0.2,
  DEFAULT_GAP_COLOR: "green",

  // ONNX TTS Model Defaults
  DEFAULT_TTS_MODEL: "ngochuyen5",
  DEFAULT_TTS_SPEED: 1.0,

  // Supported Extensions
  SUPPORTED_IMAGE_EXTS: [".png", ".jpg", ".jpeg", ".webp"],
  SUPPORTED_AUDIO_EXTS: [".mp3", ".wav", ".m4a", ".aac"],
  SUPPORTED_TEXT_EXTS: [".txt"],
} as const
