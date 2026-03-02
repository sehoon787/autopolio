import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isElectron, getBackendUrl, getPlatform, getAppVersion, getClaudeCLIStatus, getGeminiCLIStatus, getCodexCLIStatus } from '@/lib/electron'
import { externalBackendUrl } from '@/config/runtime'
import { llmApi } from '@/api/llm'
import { CLI_TYPES, LLM_PROVIDERS, AI_MODES, STORAGE_KEYS } from '@/constants'
import type { CLIType, LLMProviderType, AIMode } from '@/constants'

export const CLAUDE_CODE_MODELS = [
  'claude-sonnet-4-6-20260217',
  'claude-opus-4-6-20260205',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-5-20251001',
] as const

export const GEMINI_CLI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const

export const CODEX_CLI_MODELS = [
  'default',  // default (Codex CLI picks best available)
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
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
  codexCLIModel: string
  _defaultsApplied: boolean  // Whether auto-detection defaults have been applied

  // Actions
  initialize: () => Promise<void>
  setAIMode: (mode: AIMode) => void
  setSelectedCLI: (cli: CLIType) => void
  setSelectedLLMProvider: (provider: LLMProviderType) => void
  setClaudeCodeModel: (model: string) => void
  setGeminiCLIModel: (model: string) => void
  setCodexCLIModel: (model: string) => void
  setBackendError: (error: string) => void
  clearBackendError: () => void
}

// Synchronously detect Electron at module load time
// This ensures isElectronApp is correct from the first render
const initialIsElectron = isElectron()
console.log('[AppStore] Initial Electron detection:', initialIsElectron)

// Default backend URL for Electron (before async initialization)
const DEFAULT_BACKEND_URL = externalBackendUrl

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
      aiMode: initialIsElectron ? AI_MODES.CLI : AI_MODES.API,  // CLI for Electron, API for web
      selectedCLI: CLI_TYPES.CLAUDE_CODE,
      selectedLLMProvider: initialIsElectron ? LLM_PROVIDERS.OPENAI : LLM_PROVIDERS.GEMINI,
      claudeCodeModel: CLAUDE_CODE_MODELS[0],
      geminiCLIModel: GEMINI_CLI_MODELS[0],
      codexCLIModel: CODEX_CLI_MODELS[0],
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
            const [claudeStatus, geminiStatus, codexStatus] = await Promise.all([
              getClaudeCLIStatus(),
              getGeminiCLIStatus(),
              getCodexCLIStatus(),
            ])
            const claudeInstalled = claudeStatus?.installed ?? false
            const geminiInstalled = geminiStatus?.installed ?? false
            const codexInstalled = codexStatus?.installed ?? false

            const updates: Partial<AppState> = { _defaultsApplied: true }

            if (claudeInstalled) {
              updates.selectedCLI = CLI_TYPES.CLAUDE_CODE
              updates.aiMode = AI_MODES.CLI
            } else if (codexInstalled) {
              updates.selectedCLI = CLI_TYPES.CODEX_CLI
              updates.aiMode = AI_MODES.CLI
            } else if (geminiInstalled) {
              updates.selectedCLI = CLI_TYPES.GEMINI_CLI
              updates.aiMode = AI_MODES.CLI
            } else {
              // No CLI installed, fall back to API mode
              updates.aiMode = AI_MODES.API
            }

            set(updates as AppState)
            console.log('[AppStore] Auto-detected CLI defaults:', {
              claudeInstalled,
              geminiInstalled,
              codexInstalled,
              selectedCLI: updates.selectedCLI,
              aiMode: updates.aiMode,
            })
          } catch (error) {
            console.error('[AppStore] CLI auto-detection failed:', error)
            set({ _defaultsApplied: true })
          }
        }

        // Web mode: auto-detect CLI via backend API (first run only)
        if (!isElectronApp && !get()._defaultsApplied) {
          try {
            const response = await llmApi.getConfig()
            const config = response.data
            const claudeInstalled = config.claude_code_status?.installed ?? false
            const geminiInstalled = config.gemini_cli_status?.installed ?? false
            const codexInstalled = config.codex_cli_status?.installed ?? false

            const updates: Partial<AppState> = { _defaultsApplied: true }
            if (claudeInstalled) {
              updates.selectedCLI = CLI_TYPES.CLAUDE_CODE
              updates.aiMode = AI_MODES.CLI
            } else if (codexInstalled) {
              updates.selectedCLI = CLI_TYPES.CODEX_CLI
              updates.aiMode = AI_MODES.CLI
            } else if (geminiInstalled) {
              updates.selectedCLI = CLI_TYPES.GEMINI_CLI
              updates.aiMode = AI_MODES.CLI
            }
            set(updates as AppState)
            console.log('[AppStore] Web CLI auto-detected:', { claudeInstalled, geminiInstalled, codexInstalled })
          } catch (error) {
            console.error('[AppStore] Web CLI auto-detection failed:', error)
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
        set({ selectedCLI: cli, aiMode: AI_MODES.CLI })
      },

      // Set selected LLM provider (also switches to API mode)
      setSelectedLLMProvider: (provider) => {
        set({ selectedLLMProvider: provider, aiMode: AI_MODES.API })
      },

      setClaudeCodeModel: (model) => {
        set({ claudeCodeModel: model })
      },

      setGeminiCLIModel: (model) => {
        set({ geminiCLIModel: model })
      },

      setCodexCLIModel: (model) => {
        set({ codexCLIModel: model })
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
      name: STORAGE_KEYS.APP_STORAGE,
      // Only persist user preferences, not environment state
      partialize: (state) => ({
        aiMode: state.aiMode,
        selectedCLI: state.selectedCLI,
        selectedLLMProvider: state.selectedLLMProvider,
        claudeCodeModel: state.claudeCodeModel,
        geminiCLIModel: state.geminiCLIModel,
        codexCLIModel: state.codexCLIModel,
        _defaultsApplied: state._defaultsApplied,
      }),
      // Validate persisted models on rehydration — reset stale values
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>
        const validModel = (model: string | undefined, list: readonly string[]) =>
          model && (list as readonly string[]).includes(model) ? model : list[0]
        return {
          ...current,
          ...p,
          claudeCodeModel: validModel(p.claudeCodeModel, CLAUDE_CODE_MODELS),
          geminiCLIModel: validModel(p.geminiCLIModel, GEMINI_CLI_MODELS),
          codexCLIModel: validModel(p.codexCLIModel, CODEX_CLI_MODELS),
        }
      },
    }
  )
)

/** Convert 'default' sentinel back to empty string for backend API */
export function resolveModelForAPI(model: string): string {
  return model === 'default' ? '' : model
}
