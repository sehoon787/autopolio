import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isElectron, getBackendUrl, getPlatform, getAppVersion, getClaudeCLIStatus, getGeminiCLIStatus } from '@/lib/electron'

type CLIType = 'claude_code' | 'gemini_cli'
type LLMProviderType = 'openai' | 'anthropic' | 'gemini'
type AIMode = 'cli' | 'api'  // CLI tools or API providers

export const CLAUDE_CODE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-20250514',
] as const

export const GEMINI_CLI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const

interface AppState {
  // App environment
  isElectronApp: boolean
  backendUrl: string
  platform: string
  appVersion: string

  // Initialization state
  isInitialized: boolean

  // Backend connection error state
  backendError: string | null

  // User preferences (persisted)
  aiMode: AIMode  // Which mode is active: CLI or API
  selectedCLI: CLIType
  selectedLLMProvider: LLMProviderType
  claudeCodeModel: string
  geminiCLIModel: string
  _defaultsApplied: boolean  // Whether auto-detection defaults have been applied

  // Actions
  initialize: () => Promise<void>
  setAIMode: (mode: AIMode) => void
  setSelectedCLI: (cli: CLIType) => void
  setSelectedLLMProvider: (provider: LLMProviderType) => void
  setClaudeCodeModel: (model: string) => void
  setGeminiCLIModel: (model: string) => void
  setBackendError: (error: string) => void
  clearBackendError: () => void
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

      // Backend error state
      backendError: null,

      // User preferences (defaults)
      aiMode: initialIsElectron ? 'cli' : 'api',  // CLI for Electron, API for web
      selectedCLI: 'claude_code',
      selectedLLMProvider: initialIsElectron ? 'openai' : 'gemini',
      claudeCodeModel: CLAUDE_CODE_MODELS[0],
      geminiCLIModel: GEMINI_CLI_MODELS[0],
      _defaultsApplied: false,

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

        // Auto-detect installed CLI and set defaults (Electron only, first run)
        if (isElectronApp && !get()._defaultsApplied) {
          try {
            const [claudeStatus, geminiStatus] = await Promise.all([
              getClaudeCLIStatus(),
              getGeminiCLIStatus(),
            ])
            const claudeInstalled = claudeStatus?.installed ?? false
            const geminiInstalled = geminiStatus?.installed ?? false

            const updates: Partial<AppState> = { _defaultsApplied: true }

            if (claudeInstalled) {
              updates.selectedCLI = 'claude_code'
              updates.aiMode = 'cli'
            } else if (geminiInstalled) {
              updates.selectedCLI = 'gemini_cli'
              updates.aiMode = 'cli'
            } else {
              // No CLI installed, fall back to API mode
              updates.aiMode = 'api'
            }

            set(updates as AppState)
            console.log('[AppStore] Auto-detected CLI defaults:', {
              claudeInstalled,
              geminiInstalled,
              selectedCLI: updates.selectedCLI,
              aiMode: updates.aiMode,
            })
          } catch (error) {
            console.error('[AppStore] CLI auto-detection failed:', error)
            set({ _defaultsApplied: true })
          }
        }

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

      setClaudeCodeModel: (model) => {
        set({ claudeCodeModel: model })
      },

      setGeminiCLIModel: (model) => {
        set({ geminiCLIModel: model })
      },

      // Backend error handling
      setBackendError: (error) => {
        set({ backendError: error })
      },

      clearBackendError: () => {
        set({ backendError: null })
      },
    }),
    {
      name: 'autopolio-app-storage',
      // Only persist user preferences, not environment state
      partialize: (state) => ({
        aiMode: state.aiMode,
        selectedCLI: state.selectedCLI,
        selectedLLMProvider: state.selectedLLMProvider,
        claudeCodeModel: state.claudeCodeModel,
        geminiCLIModel: state.geminiCLIModel,
        _defaultsApplied: state._defaultsApplied,
      }),
    }
  )
)
