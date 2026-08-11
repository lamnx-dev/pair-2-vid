# pair-2-vid (`p2v`)

A CLI tool that automatically pairs images with audio (or images with TTS text files) to produce complete MP4 videos.

---

## Features

- **Smart pairing:** Automatically matches images and audio by **basename** (e.g. `01.png` + `01.mp3`).
- **TTS from text files:** If an image is paired with a `.txt` file (and no audio file), the tool synthesizes speech automatically using a Piper ONNX model (`ngochuyen5` — Vietnamese) and merges it into the video.
- **Concatenated `output.mp4` by default:**
  - Standard **9:16 Portrait** aspect ratio (e.g. `1080x1920`).
  - Images are scaled **100% fullwidth** (width fills the frame; height preserves the original aspect ratio).
  - A **green chroma-key frame (0.2 s)** is automatically inserted between segments for easy background removal in video editors.
- **Intermediate file retention (`-k` / `--keep`):** Keep segment videos, TTS audio files, or both.
- **Supported formats:**
  - Images: `.png`, `.jpg`, `.jpeg`, `.webp`
  - Audio: `.mp3`, `.wav`, `.m4a`, `.aac`
  - Text (TTS): `.txt`
- **Standard encoding:** H.264 + AAC (`yuv420p`), fully compatible with CapCut, Premiere, DaVinci, TikTok, and YouTube.

---

## Input Directory Structure

```text
./input/
├── 01.png     ← image
├── 01.mp3     ← audio (used directly)
├── 02.webp
├── 02.wav
├── 03.jpg
└── 03.txt     ← text → TTS synthesizes audio automatically
```

---

## Usage

### 1. Build videos (default command)

```bash
p2v
# OR specify directories:
p2v build -i ./input -o ./output
```

Output: creates `output.mp4` (concatenated video) inside the output directory.

---

### 2. Keep individual segment videos (`-k video`)

```bash
p2v -k video
# OR:
p2v build -i ./input -o ./output -k video
```

Result:

```text
./output/
├── output.mp4   ← concatenated video
├── 01.mp4
├── 02.mp4
└── 03.mp4
```

---

### 3. Keep all intermediate files (`-k all`)

```bash
p2v -k all
```

Keeps both segment videos and synthesized TTS WAV files.

---

### 4. Overwrite existing files (`-f`)

```bash
p2v -f
```

---

### 5. Synthesize TTS only (no video build)

```bash
p2v tts -i ./input -o ./output
```

Generates a `.wav` file for every `.txt` file found in the input directory.

---

### 6. Validate input data

```bash
p2v validate -i ./input
```

---

## CLI Options

### `p2v build` (default)

| Option               | Description                                          | Default          |
| :------------------- | :--------------------------------------------------- | :--------------- |
| `-i, --input <dir>`  | Path to the directory containing images & audio      | `.` (current dir) |
| `-o, --output <dir>` | Path to the output directory                         | `.` (current dir) |
| `-f, --force`        | Overwrite existing files                             | `false`          |
| `-k, --keep [type]`  | Keep intermediates: `video`, `audio`, or `all`       | `false`          |
| `-h, --help`         | Show help                                            |                  |
| `-V, --version`      | Show version number                                  |                  |

### `p2v tts`

| Option               | Description                                | Default          |
| :------------------- | :----------------------------------------- | :--------------- |
| `-i, --input <dir>`  | Path to the directory containing `.txt` files | `.` (current dir) |
| `-o, --output <dir>` | Path to the directory for `.wav` output    | `.` (current dir) |
| `-f, --force`        | Overwrite existing `.wav` files            | `false`          |

### `p2v validate`

| Option               | Description                          | Default          |
| :------------------- | :----------------------------------- | :--------------- |
| `-i, --input <dir>`  | Path to the directory to validate    | `.` (current dir) |
