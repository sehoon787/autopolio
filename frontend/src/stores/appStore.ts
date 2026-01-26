import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isElectron, getBackendUrl, getPlatform, getAppVersion } from '@/lib/electron'

type CLIType = 'claude_code' | 'gemini_cli'
type LLMProviderType = 'openai' | 'anthropic' | 'gemini'
type AIMode = 'cli' | 'api'  // CLI tools or API providers

interface AppState {
  // App environment
  isElectronApp: boolean
  backendUrl: string
  platform: string
  appVersion: string

  // Initialization state
  isInitialized: boolean

  // User preferences (persisted)
  aiMode: AIMode  // Which mode is active: CLI or API
  selectedCLI: CLIType
  selectedLLMProvider: LLMProviderType

  // Actions
  initialize: () => Promise<void>
  setAIMode: (mode: AIMode) => void
  setSelectedCLI: (cli: CLIType) => void
  setSelectedLLMProvider: (provider: LLMProviderType) => void
}

// Synchronously detect Electron at module load time
// This ensures isElectronApp is correct from the first render
const initialIsElectron = isElectron()
console.log('[AppStore] Initial Electron detection:', initialIsElectron)

// Default backend URL for Electron (before async initialization)
const DEFAULT_BACKEND_URL = 'http://localhost:8000'

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state - use synchronous detection result
      isElectronApp: initialIsElectron,
      // IMPORTANT: Set default backendUrl for Electron to prevent race condition
      // Before initialize() completes, API calls need a valid URL
      backendUrl: initialIsElectron ? DEFAULT_BACKEND_URL : '',
      platform: initialIsElectron ? 'detecting...' : 'web',
      appVersion: initialIsElectron ? 'detecting...' : 'web',
      isInitialized: false,

      // User preferences (defaults)
      aiMode: 'cli',  // Default to CLI mode
      selectedCLI: 'claude_code',
      selectedLLMProvider: 'openai',

      // Initialize the app store (for async values)
      initialize: async () => {
        if (get().isInitialized) {
          return
        }

        // Re-check Electron status (should be same as initial)
        const isElectronApp = isElectron()
        const [backendUrl, platform, appVersion] = await Promise.all([
          getBackendUrl(),
          getPlatform(),
          getAppVersion(),
        ])

        set({
          isElectronApp,
          backendUrl,
          platform,
          appVersion,
          isInitialized: true,
        })

        console.log('[AppStore] Initialized:', {
          isElectronApp,
          backendUrl: backendUrl || '(proxy)',
          platform,
          appVersion,
        })
      },

      // Set AI mode (CLI or API)
      setAIMode: (mode) => {
        set({ aiMode: mode })
      },

      // Set selected CLI tool (also switches to CLI mode)
      setSelectedCLI: (cli) => {
        set({ selectedCLI: cli, aiMode: 'cli' })
      },

      // Set selected LLM provider (also switches to API mode)
      setSelectedLLMProvider: (provider) => {
        set({ selectedLLMProvider: provider, aiMode: 'api' })
      },
    }),
    {
      name: 'autopolio-app-storage',
      // Only persist user preferences, not environment state
      partialize: (state) => ({
        aiMode: state.aiMode,
        selectedCLI: state.selectedCLI,
        selectedLLMProvider: state.selectedLLMProvider,
      }),
    }
  )
)
