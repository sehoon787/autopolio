import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface LLMUsage {
  openai: number
  anthropic: number
  gemini: number
  claude_code_cli: number
  gemini_cli: number
}

interface UsageState {
  lastResetDate: string
  llmTokensUsed: LLMUsage
  llmCallCount: LLMUsage

  trackTokenUsage: (provider: keyof LLMUsage, tokens: number) => void
  incrementLLMCallCount: (provider: keyof LLMUsage) => void
  resetDailyIfNeeded: () => void
  getTokensForProvider: (provider: keyof LLMUsage) => number
  getLLMCallCount: (provider: keyof LLMUsage) => number
  resetProviderUsage: (provider: keyof LLMUsage) => void
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

const emptyLLM: LLMUsage = { openai: 0, anthropic: 0, gemini: 0, claude_code_cli: 0, gemini_cli: 0 }

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      lastResetDate: getTodayDateString(),
      llmTokensUsed: { ...emptyLLM },
      llmCallCount: { ...emptyLLM },

      trackTokenUsage: (provider, tokens) => {
        get().resetDailyIfNeeded()
        set((state) => ({
          llmTokensUsed: {
            ...state.llmTokensUsed,
            [provider]: state.llmTokensUsed[provider] + tokens,
          },
        }))
      },

      incrementLLMCallCount: (provider) => {
        get().resetDailyIfNeeded()
        set((state) => ({
          llmCallCount: {
            ...state.llmCallCount,
            [provider]: state.llmCallCount[provider] + 1,
          },
        }))
      },

      resetDailyIfNeeded: () => {
        const today = getTodayDateString()
        const { lastResetDate } = get()

        if (lastResetDate !== today) {
          set({
            lastResetDate: today,
            llmTokensUsed: { ...emptyLLM },
            llmCallCount: { ...emptyLLM },
          })
        }
      },

      getTokensForProvider: (provider) => {
        // Pure getter - do not call resetDailyIfNeeded here to avoid state update during render
        return get().llmTokensUsed[provider] || 0
      },

      getLLMCallCount: (provider) => {
        // Pure getter - do not call resetDailyIfNeeded here to avoid state update during render
        return get().llmCallCount[provider] || 0
      },

      resetProviderUsage: (provider) => {
        set((state) => ({
          llmTokensUsed: { ...state.llmTokensUsed, [provider]: 0 },
          llmCallCount: { ...state.llmCallCount, [provider]: 0 },
        }))
      },
    }),
    {
      name: 'usage-storage',
      version: 4,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted || {}) as Record<string, unknown>
        if (version < 4) {
          const oldTokens = (state.llmTokensUsed || {}) as Record<string, number>
          const oldCalls = (state.llmCallCount || {}) as Record<string, number>
          return {
            lastResetDate: (state.lastResetDate as string) || getTodayDateString(),
            llmTokensUsed: { ...emptyLLM, ...oldTokens },
            llmCallCount: { ...emptyLLM, ...oldCalls },
          }
        }
        return state
      },
      partialize: (state) => ({
        lastResetDate: state.lastResetDate,
        llmTokensUsed: state.llmTokensUsed,
        llmCallCount: state.llmCallCount,
      }),
    }
  )
)
