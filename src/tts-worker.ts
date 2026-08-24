import { parentPort } from "node:worker_threads"
import { OnnxTTSEngine } from "./onnx.js"

let engine: OnnxTTSEngine | null = null
let currentModel: string | undefined = undefined

if (parentPort) {
  parentPort.on(
    "message",
    async (msg: {
      id: number
      type: "init" | "synthesize"
      model?: string
      textFilePath?: string
      outputPath?: string
    }) => {
      try {
        if (msg.type === "init") {
          if (!engine || currentModel !== msg.model) {
            currentModel = msg.model
            engine = new OnnxTTSEngine(currentModel)
            await engine.init()
          }
          parentPort!.postMessage({ id: msg.id, success: true })
        } else if (msg.type === "synthesize") {
          if (!engine || currentModel !== msg.model) {
            currentModel = msg.model
            engine = new OnnxTTSEngine(currentModel)
            await engine.init()
          }
          await engine.synthesizeFile(msg.textFilePath!, msg.outputPath!)
          parentPort!.postMessage({ id: msg.id, success: true })
        }
      } catch (err: any) {
        parentPort!.postMessage({
          id: msg.id,
          success: false,
          error: err.message || String(err),
        })
      }
    }
  )
}
