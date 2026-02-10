import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import yaml from 'js-yaml'

// Use relative paths for Electron (file:// protocol), absolute for web
const isElectronBuild = process.env.ELECTRON_BUILD === 'true'

function loadRuntimeConfig() {
  const configPath = path.resolve(__dirname, '..', 'config', 'runtime.yaml')
  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = yaml.load(raw) as any
    return parsed ?? {}
  } catch {
    return {}
  }
}

const runtimeConfig = loadRuntimeConfig()
const externalPorts = runtimeConfig?.ports?.external ?? { frontend: 3035, backend: 8085 }
const frontendPort = Number(externalPorts.frontend) || 3035
const backendPort = Number(externalPorts.backend) || 8085

export default defineConfig({
  base: isElectronBuild ? './' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __RUNTIME_CONFIG__: JSON.stringify(runtimeConfig),
  },
  server: {
    port: frontendPort,
    strictPort: true,  // Fail if port is in use (don't silently use another port)
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})
