# pair-2-vid (`p2v`)

A CLI tool that automatically pairs images with audio (or images with TTS text files) to produce complete MP4 videos with background video/music compositing and ONNX-based Text-to-Speech support.

---

## Features

- **Smart pairing:** Automatically matches images and audio/text by **basename** (e.g. `01.png` + `01.mp3`, or `02.webp` + `02.txt`).
- **TTS from text files:** If an image is paired with a `.txt` file (and no audio file), the tool synthesizes speech automatically using a local Piper ONNX model (default: `ngochuyen5` — Vietnamese) and merges it into the video segment.
- **Thumbnail / Title Intro Overlay:**
  - Automatically detects `t.txt` (or `_t.txt`) in the input folder to generate a floral frame thumbnail intro at the beginning of the video (`DEFAULT_THUMB_DURATION = 0.3s`).
  - Text is automatically wrapped (2-3 words per line), centered, and rendered using custom font `Quicksand-Bold.ttf`.
  - Background video is gently blurred (`boxblur`, radius 15) during thumbnail intro for premium aesthetic presentation.
  - Export thumbnail image directly with `-k thumb` to create `thumbnail.jpg` (first frame of the video).
- **Background Video & Music Compositing:**
  - Automatically picks random background video (from `assets/bg_videos`) and background music (from `assets/bg_music`).
  - Standard **9:16 Portrait** output (`1080x1920`).
  - Foreground images are scaled down (`scale=0.8`) and centered cleanly over the background video, keeping aspect ratio intact with transparent padding.
  - Background music is scaled in volume (default `0.4`) and mixed with primary segment audio.
- **Inter-segment transitions / gaps:**
  - Inserts customizable gaps (default `0.3` seconds) between media pairs.
- **Intermediate file retention (`-k` / `--keep`):** Keep all intermediate files (`-k`), segment videos (`-k video`), synthesized TTS audio (`-k audio`), or export thumbnail image (`-k thumb`).
- **Supported formats:**
  - Images: `.png`, `.jpg`, `.jpeg`, `.webp`
  - Audio: `.mp3`, `.wav`, `.m4a`, `.aac`
  - Text (TTS & Title): `.txt` (e.g. `t.txt` for title intro)
  - Video (for background): `.mp4`, `.mov`, `.mkv`, `.webm`
- **Standard encoding:** H.264 + AAC (`yuv420p`), fully compatible with CapCut, Premiere, DaVinci, TikTok, Shorts, and Reels.

---

## Input Directory Structure

```text
./input/
├── t.txt       ← title text for thumbnail intro (optional)
├── 01.png     ← image
├── 01.mp3     ← audio (used directly)
├── 02.webp
├── 02.wav
├── 03.jpg
└── 03.txt     ← text → TTS synthesizes audio automatically
```

---

## Usage & Commands

### 1. Build videos (`build` / default command)

```bash
p2v
# OR explicitly run build with options:
p2v build -i ./input -o ./output
```

Produces `output.mp4` (concatenated video) in the output directory.

---

### 2. Choose TTS Model (`-m` / `--model`)

You can specify a model on the fly during `build` or `tts`:

```bash
p2v -m ngochuyen5
p2v build -m namtrung
```

Or select and set your **persistent default TTS model** interactively:

```bash
p2v models
```

---

### 3. Keep intermediate segment files & Thumbnail (`-k` / `--keep`)

```bash
# Keep both segment videos (.mp4), TTS audio (.wav), and thumbnail.jpg
p2v -k

# Export thumbnail image only (thumbnail.jpg from first frame)
p2v -k thumb

# Keep individual segment videos (.mp4) only
p2v -k video

# Keep synthesized TTS audio (.wav) only
p2v -k audio
```

Result with `-k thumb`:

```text
./output/
├── output.mp4       ← final concatenated & composited video
└── thumbnail.jpg    ← extracted high quality first frame thumbnail
```

---

### 4. Overwrite existing files (`-f` / `--force`)

```bash
p2v -f
```

---

### 5. Synthesize TTS only (`tts`)

Synthesize WAV audio from text files without rendering video segments:

```bash
p2v tts -i ./input -o ./output -m ngochuyen5
```

---

### 6. Test all TTS models (`test-tts`)

Synthesize WAV audio using **all** available ONNX models found in the models directory for visual/auditory testing:

```bash
p2v test-tts -i ./input -o ./test_output
```

---

### 7. Validate input data (`validate`)

Check if image-audio/text pairs are correctly structured and detect duplicates or missing files:

```bash
p2v validate -i ./input
```

---

## CLI Options Summary

### `p2v build` (Default)

| Option               | Description                                                       | Default            |
| :------------------- | :---------------------------------------------------------------- | :----------------- |
| `-i, --input <dir>`  | Path to input directory containing images & audio/txt             | `.` (current dir)  |
| `-o, --output <dir>` | Path to output directory                                          | `.` (current dir)  |
| `-f, --force`        | Overwrite existing output files                                   | `false`            |
| `-k, --keep [type]`  | Keep intermediate files: `-k` (all), `video`, `audio`, or `thumb` | `false`            |
| `-m, --model <name>` | TTS model name to use for text synthesis                          | Configured default |
| `-h, --help`         | Show help                                                         |                    |
| `-V, --version`      | Show version number                                               |                    |

### `p2v models`

Interactive selector to view available ONNX TTS models and change the default model saved in `~/.p2vrc`.

### `p2v tts`

| Option               | Description                               | Default            |
| :------------------- | :---------------------------------------- | :----------------- |
| `-i, --input <dir>`  | Path to directory containing `.txt` files | `.` (current dir)  |
| `-o, --output <dir>` | Path to output directory for `.wav` files | `.` (current dir)  |
| `-f, --force`        | Overwrite existing `.wav` files           | `false`            |
| `-m, --model <name>` | TTS model name to use for text synthesis  | Configured default |

### `p2v test-tts`

| Option               | Description                                   | Default           |
| :------------------- | :-------------------------------------------- | :---------------- |
| `-i, --input <dir>`  | Path to directory containing `.txt` files     | `.` (current dir) |
| `-o, --output <dir>` | Path to output root directory (`test_output`) | `test_output`     |
| `-f, --force`        | Overwrite existing `.wav` files               | `false`           |

### `p2v validate`

| Option              | Description                                        | Default           |
| :------------------ | :------------------------------------------------- | :---------------- |
| `-i, --input <dir>` | Path to directory to validate image/audio pairings | `.` (current dir) |
