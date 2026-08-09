export const CONFIG = {
  // Directory & File Defaults
  DEFAULT_INPUT_DIR: ".",
  DEFAULT_OUTPUT_DIR: ".",
  DEFAULT_CONCAT_FILENAME: "content.mp4",
  SINGLES_DIR_NAME: "singles",

  // Video Render Settings (9:16 Portrait)
  DEFAULT_FPS: 30,
  ASPECT_RATIO_WIDTH: 9,
  ASPECT_RATIO_HEIGHT: 16,
  DEFAULT_WIDTH: 1080,

  // Gap / Transition Settings
  DEFAULT_GAP_DURATION: 0.2, // seconds between clips
  DEFAULT_GAP_COLOR: "green", // FFmpeg green screen color for chroma keying
} as const
