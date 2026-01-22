import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LLMUsage {
  openai: number
  anthropic: number
  gemini: number
}

interface UsageState {
  // Daily API call tracking
  dailyApiCalls: number
  lastResetDate: string

  // LLM token usage
  llmTokensUsed: LLMUsage

  // Session stats
  sessionApiCalls: number
  sessionStartTime: number

  // Actions
  incrementApiCall: () => void
  trackTokenUsage: (provider: keyof LLMUsage, tokens: number) => void
  resetDailyIfNeeded: () => void
  getUsageStats: () => {
    dailyApiCalls: number
    sessionApiCalls: number
    llmTokensUsed: LLMUsage
    sessionDuration: number
  }
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      dailyApiCalls: 0,
      lastResetDate: getTodayDateString(),
      llmTokensUsed: {
        openai: 0,
        anthropic: 0,
        gemini: 0,
      },
      sessionApiCalls: 0,
      sessionStartTime: Date.now(),

      incrementApiCall: () => {
        get().resetDailyIfNeeded()
        set((state) => ({
          dailyApiCalls: state.dailyApiCalls + 1,
          sessionApiCalls: state.sessionApiCalls + 1,
        }))
      },

      trackTokenUsage: (provider, tokens) => {
        get().resetDailyIfNeeded()
        set((state) => ({
          llmTokensUsed: {
            ...state.llmTokensUsed,
            [provider]: state.llmTokensUsed[provider] + tokens,
          },
        }))
      },

      resetDailyIfNeeded: () => {
        const today = getTodayDateString()
        const { lastResetDate } = get()

        if (lastResetDate !== today) {
          set({
            dailyApiCalls: 0,
            lastResetDate: today,
            llmTokensUsed: {
              openai: 0,
              anthropic: 0,
              gemini: 0,
            },
          })
        }
      },

      getUsageStats: () => {
        const state = get()
        state.resetDailyIfNeeded()
        return {
          dailyApiCalls: state.dailyApiCalls,
          sessionApiCalls: state.sessionApiCalls,
          llmTokensUsed: state.llmTokensUsed,
          sessionDuration: Math.floor((Date.now() - state.sessionStartTime) / 1000 / 60), // minutes
        }
      },
    }),
    {
      name: 'usage-storage',
      partialize: (state) => ({
        dailyApiCalls: state.dailyApiCalls,
        lastResetDate: state.lastResetDate,
        llmTokensUsed: state.llmTokensUsed,
      }),
    }
  )
)
