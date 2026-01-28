/**
 * Electron preload script
 * Exposes safe Electron APIs to the renderer process via contextBridge
 *
 * IMPORTANT: This must be CommonJS format (not ES modules)
 * because Electron's preload scripts require CommonJS.
 */
const { contextBridge, ipcRenderer } = require('electron')

// Expose Electron API to renderer process
contextBridge.exposeInMainWorld('electron', {
  // ============================================================================
  // Basic APIs
  // ============================================================================

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

  // ============================================================================
  // CLI Detection APIs (existing)
  // ============================================================================

  // Get Claude CLI status
  getClaudeCLIStatus: () => ipcRenderer.invoke('get-claude-cli-status'),

  // Get Gemini CLI status
  getGeminiCLIStatus: () => ipcRenderer.invoke('get-gemini-cli-status'),

  // Refresh all CLI statuses
  refreshCLIStatus: () => ipcRenderer.invoke('refresh-cli-status'),

  // Refresh a single CLI status (individual refresh)
  refreshSingleCLIStatus: (tool) => ipcRenderer.invoke('refresh-single-cli-status', tool),

  // ============================================================================
  // CLI Test API (NEW)
  // ============================================================================

  // Test a CLI by running --version
  testCLI: (tool, model) => ipcRenderer.invoke('cli:test', tool, model),

  // ============================================================================
  // CLI Process Management APIs (NEW)
  // ============================================================================

  // Start a CLI process
  startCLI: (config) => ipcRenderer.invoke('cli:start', config),

  // Stop a CLI process
  stopCLI: (sessionId) => ipcRenderer.invoke('cli:stop', sessionId),

  // Get status of a CLI process
  getCLIProcessStatus: (sessionId) => ipcRenderer.invoke('cli:status', sessionId),

  // Get all active CLI sessions
  getCLISessions: () => ipcRenderer.invoke('cli:sessions'),

  // Send input to a CLI process
  sendCLIInput: (sessionId, input) => ipcRenderer.invoke('cli:send-input', sessionId, input),

  // ============================================================================
  // CLI Output Streaming APIs (NEW)
  // ============================================================================

  // Subscribe to CLI output
  // Returns an unsubscribe function
  subscribeCLIOutput: (sessionId, callback) => {
    // Create a handler for CLI output events
    const handler = (_event, data) => {
      if (data && data.sessionId === sessionId) {
        callback(data)
      }
    }

    // Subscribe to the output event
    ipcRenderer.on('cli:output', handler)

    // Tell main process to start sending output for this session
    ipcRenderer.send('cli:subscribe', sessionId)

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('cli:output', handler)
      ipcRenderer.send('cli:unsubscribe', sessionId)
    }
  },

  // One-time listener for CLI output (for simple cases)
  onCLIOutput: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('cli:output', handler)
    return () => ipcRenderer.removeListener('cli:output', handler)
  },
})

console.log('[Preload] Electron APIs exposed to window.electron')
