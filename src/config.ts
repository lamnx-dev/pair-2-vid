export const CONFIG = {
  // Directory & File Defaults
  DEFAULT_INPUT_DIR: ".",
  DEFAULT_OUTPUT_DIR: ".",
  DEFAULT_OUTPUT_FILENAME: "output.mp4",

  // Gap / Transition Settings
  DEFAULT_GAP_DURATION: 0.3,

  // Background Repositories & Compositing Settings
  DEFAULT_BG_VIDEO_DIR: "assets/bg_videos",
  DEFAULT_BG_MUSIC_DIR: "assets/bg_music",
  DEFAULT_BG_MUSIC_VOLUME: 0.4,
  DEFAULT_FG_SCALE: 0.8,
  MIN_BG_START_OFFSET: 3,

  // ONNX TTS Model Defaults
  DEFAULT_TTS_MODEL: "ngochuyen5",
  DEFAULT_TTS_SPEED: 1.1,

  // Supported Extensions
  SUPPORTED_IMAGE_EXTS: [".png", ".jpg", ".jpeg", ".webp"],
  SUPPORTED_AUDIO_EXTS: [".mp3", ".wav", ".m4a", ".aac"],
  SUPPORTED_TEXT_EXTS: [".txt"],
  SUPPORTED_VIDEO_EXTS: [".mp4", ".mov", ".mkv", ".webm"],
} as const
