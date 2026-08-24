import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getWorkerPath(): string {
  const distInRoot = path.resolve(__dirname, "../dist/tts-worker.js")
  if (fs.existsSync(distInRoot)) {
    return distInRoot
  }
  const distSameDir = path.resolve(__dirname, "tts-worker.js")
  if (fs.existsSync(distSameDir)) {
    return distSameDir
  }
  return distSameDir
}

interface WorkerTask {
  textFilePath: string
  outputPath: string
  model?: string
  resolve: () => void
  reject: (err: Error) => void
}

interface ManagedWorker {
  worker: Worker
  busy: boolean
  currentMsgId: number
  activeTask?: {
    resolve: () => void
    reject: (err: Error) => void
  }
}

export class TTSWorkerPool {
  private workers: ManagedWorker[] = []
  private queue: WorkerTask[] = []
  private model?: string
  private poolSize: number
  private nextMsgId = 1

  constructor(poolSize: number = 4, model?: string) {
    this.poolSize = Math.max(1, poolSize)
    this.model = model
  }

  async init(): Promise<void> {
    const workerPath = getWorkerPath()
    const initPromises: Promise<void>[] = []

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath, {
        execArgv: process.execArgv,
      })

      const managed: ManagedWorker = {
        worker,
        busy: false,
        currentMsgId: 0,
      }

      worker.on(
        "message",
        (msg: { id: number; success: boolean; error?: string }) => {
          if (managed.activeTask) {
            const { resolve, reject } = managed.activeTask
            managed.activeTask = undefined
            managed.busy = false

            if (msg.success) {
              resolve()
            } else {
              reject(new Error(msg.error || "TTS synthesis worker failed"))
            }

            this.dispatch()
          }
        }
      )

      worker.on("error", (err) => {
        if (managed.activeTask) {
          const { reject } = managed.activeTask
          managed.activeTask = undefined
          managed.busy = false
          reject(err)
        }
        this.dispatch()
      })

      this.workers.push(managed)

      const msgId = this.nextMsgId++
      const initPromise = new Promise<void>((resolve, reject) => {
        managed.busy = true
        managed.activeTask = { resolve, reject }
        worker.postMessage({ id: msgId, type: "init", model: this.model })
      })

      initPromises.push(initPromise)
    }

    await Promise.all(initPromises)
  }

  private dispatch(): void {
    if (this.queue.length === 0) return

    const idleWorker = this.workers.find((w) => !w.busy)
    if (!idleWorker) return

    const task = this.queue.shift()!
    idleWorker.busy = true
    idleWorker.activeTask = {
      resolve: task.resolve,
      reject: task.reject,
    }

    const msgId = this.nextMsgId++
    idleWorker.worker.postMessage({
      id: msgId,
      type: "synthesize",
      model: this.model,
      textFilePath: task.textFilePath,
      outputPath: task.outputPath,
    })
  }

  async synthesizeFile(
    textFilePath: string,
    outputPath: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        textFilePath,
        outputPath,
        model: this.model,
        resolve,
        reject,
      })
      this.dispatch()
    })
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.worker.terminate()))
    this.workers = []
    this.queue = []
  }
}
