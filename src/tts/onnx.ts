import * as ort from "onnxruntime-node"
import fs from "fs"
import path from "path"
import { initialize, phonemizeToString } from "piper-phonemize"

export interface OnnxTTSConfig {
  audio?: {
    sample_rate?: number
  }
  inference?: {
    noise_scale?: number
    length_scale?: number
    noise_w?: number
  }
  phoneme_id_map?: Record<string, number[]>
}

export interface OnnxEngineOptions {
  modelPath: string
  configPath: string
  lengthScale?: number
  noiseScale?: number
  noiseW?: number
}

let isPiperPhonemizeInitialized = false

export class OnnxTTSEngine {
  private session: ort.InferenceSession | null = null
  private config: OnnxTTSConfig | null = null
  private options: OnnxEngineOptions

  constructor(options: OnnxEngineOptions) {
    this.options = options
  }

  async init(): Promise<void> {
    if (!fs.existsSync(this.options.modelPath)) {
      throw new Error(`ONNX model file not found at: "${this.options.modelPath}"`)
    }
    if (!fs.existsSync(this.options.configPath)) {
      throw new Error(`ONNX config file not found at: "${this.options.configPath}"`)
    }

    const configContent = fs.readFileSync(this.options.configPath, "utf-8")
    this.config = JSON.parse(configContent)

    if (!isPiperPhonemizeInitialized) {
      await initialize()
      isPiperPhonemizeInitialized = true
    }

    this.session = await ort.InferenceSession.create(this.options.modelPath)
  }

  public textToPhonemeIds(text: string): number[] {
    if (!this.config || !this.config.phoneme_id_map) {
      throw new Error("ONNX config has no phoneme_id_map")
    }

    const idMap = this.config.phoneme_id_map
    const bos = idMap["^"] ? idMap["^"][0] : 1
    const eos = idMap["$"] ? idMap["$"][0] : 2
    const pad = idMap["_"] ? idMap["_"][0] : 0

    const symbolIds: number[] = [bos]

    // Use piper-phonemize WASM for official espeak-ng Vietnamese IPA conversion
    const ipaResult = phonemizeToString(text, "vi")
    const ipaString = Array.isArray(ipaResult) ? ipaResult.join(" ") : String(ipaResult)

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

    const tokenIds = this.textToPhonemeIds(text)

    const noiseScale = this.options.noiseScale ?? this.config?.inference?.noise_scale ?? 0.667
    const lengthScale = this.options.lengthScale ?? this.config?.inference?.length_scale ?? 1.0
    const noiseW = this.options.noiseW ?? this.config?.inference?.noise_w ?? 0.8

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
    const sampleRate = this.config?.audio?.sample_rate || 22050

    const wavBuffer = this.createWavBuffer(audioData, sampleRate)
    
    // Ensure directory exists
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(outputPath, wavBuffer)
    return outputPath
  }

  async synthesizeFile(textFilePath: string, outputPath: string): Promise<string> {
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
