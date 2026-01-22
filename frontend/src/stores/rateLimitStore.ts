import { create } from 'zustand'

interface RateLimitEvent {
  provider: string
  timestamp: Date
  message?: string
}

interface RateLimitState {
  isRateLimited: boolean
  rateLimitedUntil: Date | null
  lastRateLimitEvent: RateLimitEvent | null
  rateLimitHistory: RateLimitEvent[]

  // Actions
  setRateLimited: (until: Date, provider: string, message?: string) => void
  clearRateLimit: () => void
  checkRateLimitExpired: () => boolean
  getRemainingTime: () => number | null
}

export const useRateLimitStore = create<RateLimitState>((set, get) => ({
  isRateLimited: false,
  rateLimitedUntil: null,
  lastRateLimitEvent: null,
  rateLimitHistory: [],

  setRateLimited: (until, provider, message) => {
    const event: RateLimitEvent = {
      provider,
      timestamp: new Date(),
      message,
    }

    set((state) => ({
      isRateLimited: true,
      rateLimitedUntil: until,
      lastRateLimitEvent: event,
      rateLimitHistory: [...state.rateLimitHistory.slice(-9), event], // Keep last 10 events
    }))

    // Auto-clear when rate limit expires
    const remainingMs = until.getTime() - Date.now()
    if (remainingMs > 0) {
      setTimeout(() => {
        get().clearRateLimit()
      }, remainingMs)
    }
  },

  clearRateLimit: () => {
    set({
      isRateLimited: false,
      rateLimitedUntil: null,
    })
  },

  checkRateLimitExpired: () => {
    const { rateLimitedUntil, isRateLimited } = get()

    if (!isRateLimited || !rateLimitedUntil) {
      return true
    }

    if (rateLimitedUntil.getTime() <= Date.now()) {
      get().clearRateLimit()
      return true
    }

    return false
  },

  getRemainingTime: () => {
    const { rateLimitedUntil, isRateLimited } = get()

    if (!isRateLimited || !rateLimitedUntil) {
      return null
    }

    const remaining = rateLimitedUntil.getTime() - Date.now()
    return remaining > 0 ? Math.ceil(remaining / 1000) : null
  },
}))
