import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

type Ports = { frontend: number; backend: number }
type RuntimeConfig = { ports?: { external?: Ports; docker?: Ports } }

function loadRuntimeConfig(): RuntimeConfig {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const configPath = path.join(repoRoot, 'config', 'runtime.yaml')
  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    return (yaml.load(raw) as RuntimeConfig) ?? {}
  } catch {
    return {}
  }
}

const runtimeConfig = loadRuntimeConfig()
const externalPorts = runtimeConfig.ports?.external ?? { frontend: 3035, backend: 8085 }

export const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${externalPorts.frontend ?? 3035}`
export const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${externalPorts.backend ?? 8085}/api`
