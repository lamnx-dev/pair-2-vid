import fs from "fs"
import os from "os"
import path from "path"
import { CONFIG } from "./config.js"

const CONFIG_DIR = path.join(os.homedir(), ".p2v")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

export interface UserConfig {
  defaultTTSModel?: string
}

export function readUserConfig(): UserConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8")
      return JSON.parse(raw) as UserConfig
    }
  } catch {
    // ignore malformed config
  }
  return {}
}

export function writeUserConfig(config: UserConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
}

export function getDefaultTTSModel(): string {
  const userCfg = readUserConfig()
  return userCfg.defaultTTSModel ?? CONFIG.DEFAULT_TTS_MODEL
}

export function setDefaultTTSModel(modelName: string): void {
  const existing = readUserConfig()
  writeUserConfig({ ...existing, defaultTTSModel: modelName })
}
