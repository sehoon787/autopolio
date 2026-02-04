import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface LLMUsage {
  openai: number
  anthropic: number
  gemini: number
  claude_code_cli: number
  gemini_cli: number
}

interface UsageState {
  userId: number | null  // Current user ID for per-user tracking
  lastResetDate: string
  llmTokensUsed: LLMUsage
  llmCallCount: LLMUsage

  setUserId: (userId: number | null) => void
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

// Storage key generator for per-user tracking
const getStorageKey = (userId: number | null) => `usage-storage-${userId || 'guest'}`

// Custom storage that uses dynamic key based on userId
const createUserStorage = () => {
  let currentKey = 'usage-storage-guest'

  return {
    getItem: (_name: string) => {
      const item = localStorage.getItem(currentKey)
      return item
    },
    setItem: (_name: string, value: string) => {
      localStorage.setItem(currentKey, value)
    },
    removeItem: (_name: string) => {
      localStorage.removeItem(currentKey)
    },
    setKey: (userId: number | null) => {
      currentKey = getStorageKey(userId)
    },
    getCurrentKey: () => currentKey,
  }
}

const userStorage = createUserStorage()

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      userId: null,
      lastResetDate: getTodayDateString(),
      llmTokensUsed: { ...emptyLLM },
      llmCallCount: { ...emptyLLM },

      setUserId: (userId) => {
        const currentUserId = get().userId
        if (currentUserId !== userId) {
          // Change storage key and reload data for new user
          userStorage.setKey(userId)
          const stored = localStorage.getItem(getStorageKey(userId))
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              const state = parsed.state || {}
              set({
                userId,
                lastResetDate: state.lastResetDate || getTodayDateString(),
                llmTokensUsed: { ...emptyLLM, ...(state.llmTokensUsed || {}) },
                llmCallCount: { ...emptyLLM, ...(state.llmCallCount || {}) },
              })
            } catch {
              set({ userId, lastResetDate: getTodayDateString(), llmTokensUsed: { ...emptyLLM }, llmCallCount: { ...emptyLLM } })
            }
          } else {
            set({ userId, lastResetDate: getTodayDateString(), llmTokensUsed: { ...emptyLLM }, llmCallCount: { ...emptyLLM } })
          }
        }
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
      version: 5,
      storage: createJSONStorage(() => userStorage),
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted || {}) as Record<string, unknown>
        if (version < 5) {
          const oldTokens = (state.llmTokensUsed || {}) as Record<string, number>
          const oldCalls = (state.llmCallCount || {}) as Record<string, number>
          return {
            userId: null,
            lastResetDate: (state.lastResetDate as string) || getTodayDateString(),
            llmTokensUsed: { ...emptyLLM, ...oldTokens },
            llmCallCount: { ...emptyLLM, ...oldCalls },
          }
        }
        return state
      },
      partialize: (state) => ({
        userId: state.userId,
        lastResetDate: state.lastResetDate,
        llmTokensUsed: state.llmTokensUsed,
        llmCallCount: state.llmCallCount,
      }),
    }
  )
)
