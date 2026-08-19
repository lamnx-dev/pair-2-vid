export const CONFIG = {
  // Directory & File Defaults
  DEFAULT_INPUT_DIR: ".",
  DEFAULT_OUTPUT_DIR: ".",
  DEFAULT_OUTPUT_FILENAME: "output.mp4",
  DEFAULT_TITLE_FILENAME: "title.txt",
  IGNORED_PREFIXES: ["_"],
  IGNORED_FILENAMES: ["title.txt", "caption.txt"],

  // Gap / Transition Settings
  DEFAULT_GAP_DURATION: 0.3,

  // Concurrency Settings
  DEFAULT_CONCURRENCY: 5,

  // Background Repositories & Compositing Settings
  DEFAULT_BG_VIDEO_DIR: "D:/Workspace/comment-video-studio/assets/bg_videos",
  DEFAULT_BG_MUSIC_DIR: "D:/Workspace/comment-video-studio/assets/bg_music",
  DEFAULT_BG_MUSIC_VOLUME: 0.4,
  DEFAULT_FG_SCALE: 0.8,
  MIN_BG_START_OFFSET: 3,

  // ONNX TTS Model Defaults
  DEFAULT_TTS_MODEL: "ngochuyen5",
  DEFAULT_TTS_SPEED: 1.1,

  // Thumbnail Settings
  DEFAULT_THUMB_DURATION: 0.1,
  DEFAULT_THUMB_BLUR_RADIUS: 15,
  DEFAULT_THUMB_FRAME_PATH:
    "D:/Workspace/comment-video-studio/assets/frames/flower_frame.png",
  DEFAULT_THUMB_FONT_PATH:
    "D:/Workspace/comment-video-studio/assets/fonts/Quicksand-Bold.ttf",
  DEFAULT_THUMB_TEXT_COLOR: "#ff6e80",
  DEFAULT_THUMB_OUTPUT_FILENAME: "thumbnail.jpg",

  // Supported Extensions
  SUPPORTED_IMAGE_EXTS: [".png", ".jpg", ".jpeg", ".webp"],
  SUPPORTED_AUDIO_EXTS: [".mp3", ".wav", ".m4a", ".aac"],
  SUPPORTED_TEXT_EXTS: [".txt"],
  SUPPORTED_VIDEO_EXTS: [".mp4", ".mov", ".mkv", ".webm"],
} as const
