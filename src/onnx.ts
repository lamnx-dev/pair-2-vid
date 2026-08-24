import fs from "fs"
import * as ort from "onnxruntime-node"
import path from "path"
import { fileURLToPath } from "url"
import { initialize, phonemizeToString } from "piper-phonemize"
import { CONFIG } from "./config.js"
import { OnnxTTSConfig } from "./types/index.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRootDir = path.resolve(__dirname, "..")

let isPiperPhonemizeInitialized = false

export interface TextSegment {
  type: "text" | "pause"
  text?: string
  durationMs?: number
}

export function parseDurationMs(raw: string): number {
  const s = raw.trim().toLowerCase()
  if (s.endsWith("ms")) {
    return parseFloat(s.slice(0, -2)) || 0
  }
  if (s.endsWith("s")) {
    return (parseFloat(s.slice(0, -1)) || 0) * 1000
  }
  return 0
}

export function parseTextWithBreaks(input: string): TextSegment[] {
  const segments: TextSegment[] = []
  // Standard SSML format: <break time="200ms"/>, <break time="500ms"/>, <break time="1s"/>, <break time="2s"/>
  const regex = /<break\s+time=["']([0-9.]+(?:ms|s))["']\s*\/?>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(input)) !== null) {
    const textBefore = input.slice(lastIndex, match.index).trim()
    if (textBefore) {
      segments.push({ type: "text", text: textBefore })
    }
    const rawTime = match[1]
    if (rawTime) {
      const durationMs = parseDurationMs(rawTime)
      if (durationMs > 0) {
        segments.push({ type: "pause", durationMs })
      }
    }
    lastIndex = match.index + match[0].length
  }

  const remainingText = input.slice(lastIndex).trim()
  if (remainingText) {
    segments.push({ type: "text", text: remainingText })
  }

  return segments
}

export function stripBreakTags(text: string): string {
  const regex = /<break\s+time=["'][0-9.]+(?:ms|s)["']\s*\/?>/gi
  return text.replace(regex, "").replace(/\s+/g, " ").trim()
}

export class OnnxTTSEngine {
  private session: ort.InferenceSession | null = null
  private config: OnnxTTSConfig | null = null
  private modelPath: string
  private configPath: string

  constructor(modelName?: string) {
    const name = modelName ?? CONFIG.DEFAULT_TTS_MODEL
    this.modelPath = path.resolve(pkgRootDir, `models/${name}.onnx`)
    this.configPath = path.resolve(pkgRootDir, `models/${name}.onnx.json`)
  }

  async init(): Promise<void> {
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`ONNX model file not found at: "${this.modelPath}"`)
    }
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`ONNX config file not found at: "${this.configPath}"`)
    }

    const configContent = fs.readFileSync(this.configPath, "utf-8")
    this.config = JSON.parse(configContent)

    if (!isPiperPhonemizeInitialized) {
      await initialize()
      isPiperPhonemizeInitialized = true
    }

    this.session = await ort.InferenceSession.create(this.modelPath, {
      intraOpNumThreads: CONFIG.DEFAULT_ONNX_THREADS,
      interOpNumThreads: 1,
    })
  }

  public textToPhonemeIds(text: string): number[] {
    if (!this.config) {
      throw new Error(
        "ONNX engine has not been initialized. Call init() first."
      )
    }

    const idMap = this.config.phoneme_id_map

    const bos = idMap["^"] ? idMap["^"][0] : 1
    const eos = idMap["$"] ? idMap["$"][0] : 2
    const pad = idMap["_"] ? idMap["_"][0] : 0

    const symbolIds: number[] = [bos]

    // Use piper-phonemize WASM for official espeak-ng Vietnamese IPA conversion
    const ipaResult = phonemizeToString(text, "vi")
    const ipaString = Array.isArray(ipaResult)
      ? ipaResult.join(" ")
      : String(ipaResult)

    for (const char of ipaString) {
      if (idMap[char]) {
        symbolIds.push(idMap[char][0])
        symbolIds.push(pad)
      }
    }

    if (symbolIds[symbolIds.length - 1] === pad) {
      symbolIds[symbolIds.length - 1] = eos
    } else {
      symbolIds.push(eos)
    }

    return symbolIds
  }

  private async inferSingleText(text: string): Promise<Float32Array> {
    const config = this.config!
    const tokenIds = this.textToPhonemeIds(text)
    if (tokenIds.length <= 2) {
      return new Float32Array(0)
    }

    const noiseScale = config.inference.noise_scale
    const lengthScale = config.inference.length_scale / CONFIG.DEFAULT_TTS_SPEED
    const noiseW = config.inference.noise_w

    const inputTensor = new ort.Tensor(
      "int64",
      BigInt64Array.from(tokenIds.map(BigInt)),
      [1, tokenIds.length]
    )
    const lengthTensor = new ort.Tensor(
      "int64",
      BigInt64Array.from([BigInt(tokenIds.length)]),
      [1]
    )
    const scalesTensor = new ort.Tensor(
      "float32",
      Float32Array.from([noiseScale, lengthScale, noiseW]),
      [3]
    )

    const feeds: Record<string, ort.Tensor> = {
      input: inputTensor,
      input_lengths: lengthTensor,
      scales: scalesTensor,
    }

    const outputs = await this.session!.run(feeds)
    return outputs.output.data as Float32Array
  }

  async synthesizeText(text: string, outputPath: string): Promise<string> {
    if (!this.session || !this.config) {
      await this.init()
    }

    const config = this.config!
    const sampleRate = config.audio.sample_rate
    const segments = parseTextWithBreaks(text)

    const audioParts: Float32Array[] = []
    let totalSamples = 0

    for (const segment of segments) {
      if (segment.type === "text" && segment.text) {
        const audio = await this.inferSingleText(segment.text)
        if (audio.length > 0) {
          audioParts.push(audio)
          totalSamples += audio.length
        }
      } else if (segment.type === "pause" && segment.durationMs) {
        const sampleCount = Math.floor((segment.durationMs / 1000) * sampleRate)
        if (sampleCount > 0) {
          const silence = new Float32Array(sampleCount)
          audioParts.push(silence)
          totalSamples += sampleCount
        }
      }
    }

    // Merge all audio parts
    const mergedSamples = new Float32Array(totalSamples)
    let offset = 0
    for (const part of audioParts) {
      mergedSamples.set(part, offset)
      offset += part.length
    }

    const wavBuffer = this.createWavBuffer(mergedSamples, sampleRate)

    // Ensure directory exists
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(outputPath, wavBuffer)
    return outputPath
  }

  async synthesizeFile(
    textFilePath: string,
    outputPath: string
  ): Promise<string> {
    const text = fs.readFileSync(textFilePath, "utf-8").trim()
    return this.synthesizeText(text, outputPath)
  }

  private createWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1
    const bitsPerSample = 16
    const bytesPerSample = bitsPerSample / 8
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = samples.length * bytesPerSample
    const buffer = Buffer.alloc(44 + dataSize)

    buffer.write("RIFF", 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write("WAVE", 8)
    buffer.write("fmt ", 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(numChannels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(byteRate, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(bitsPerSample, 34)
    buffer.write("data", 36)
    buffer.writeUInt32LE(dataSize, 40)

    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      const val = s < 0 ? s * 0x8000 : s * 0x7fff
      buffer.writeInt16LE(val, offset)
      offset += 2
    }
    return buffer
  }
}
