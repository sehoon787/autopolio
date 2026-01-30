import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Use relative paths for Electron (file:// protocol), absolute for web
const isElectronBuild = process.env.ELECTRON_BUILD === 'true'

export default defineConfig({
  base: isElectronBuild ? './' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,  // Fail if port is in use (don't silently use another port)
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
