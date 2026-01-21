import { contextBridge, ipcRenderer } from 'electron'

// Expose electron APIs to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // Check if running in Electron
  isElectron: () => ipcRenderer.invoke('is-electron'),

  // Get backend URL for API calls
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),

  // Get current platform (win32, darwin, linux)
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Get app version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Get user data path
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
})

// TypeScript declaration for window.electron
declare global {
  interface Window {
    electron?: {
      isElectron: () => Promise<boolean>
      getBackendUrl: () => Promise<string>
      getPlatform: () => Promise<string>
      getAppVersion: () => Promise<string>
      getUserDataPath: () => Promise<string>
    }
  }
}
