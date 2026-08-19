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

    this.session = await ort.InferenceSession.create(this.modelPath)
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

  async synthesizeText(text: string, outputPath: string): Promise<string> {
    if (!this.session || !this.config) {
      await this.init()
    }

    const config = this.config!
    const tokenIds = this.textToPhonemeIds(text)

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
    const audioData = outputs.output.data as Float32Array
    const sampleRate = config.audio.sample_rate

    const wavBuffer = this.createWavBuffer(audioData, sampleRate)

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
