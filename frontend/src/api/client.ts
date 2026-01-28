import axios from 'axios'
import { useAppStore } from '@/stores/appStore'
import { useUsageStore } from '@/stores/usageStore'
import { useRateLimitStore } from '@/stores/rateLimitStore'
import { detectRateLimit } from '@/lib/rateLimitDetector'

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Dynamic base URL interceptor for Electron/Web dual mode
apiClient.interceptors.request.use((config) => {
  const { backendUrl, isElectronApp } = useAppStore.getState()

  // Set base URL based on environment
  if (isElectronApp && backendUrl) {
    config.baseURL = `${backendUrl}/api`
  } else {
    config.baseURL = '/api' // Web: use Vite proxy
  }

  // Add user_id to all requests (only if valid)
  const userId = localStorage.getItem('user_id')
  const parsedUserId = userId ? parseInt(userId, 10) : NaN

  // Only add user_id if it's a valid positive integer
  if (!isNaN(parsedUserId) && parsedUserId > 0) {
    if (config.params) {
      config.params.user_id = parsedUserId
    } else {
      config.params = { user_id: parsedUserId }
    }
  }

  return config
})

// Response interceptor for usage tracking and rate limit detection
apiClient.interceptors.response.use(
  (response) => {
    // Track usage based on provider in response (CLI/API agnostic)
    const explicitProvider = response.data?.provider
    const tokenUsage = response.data?.token_usage ?? response.data?.usage

    if (explicitProvider) {
      const store = useUsageStore.getState()
      const providerKey = explicitProvider as 'openai' | 'anthropic' | 'gemini'

      console.debug('[Usage Tracking]', { url: response.config.url, provider: providerKey, tokenUsage })

      // Always count the call
      store.incrementLLMCallCount(providerKey)

      // Track tokens if available
      if (typeof tokenUsage === 'number' && tokenUsage > 0) {
        store.trackTokenUsage(providerKey, tokenUsage)
      } else if (typeof tokenUsage === 'object' && tokenUsage.total_tokens) {
        store.trackTokenUsage(providerKey, tokenUsage.total_tokens)
      }
    } else if (tokenUsage !== undefined && tokenUsage !== null) {
      // No explicit provider but has token_usage — use URL detection as fallback
      const provider = detectProviderFromUrl(response.config.url)
      if (provider) {
        const store = useUsageStore.getState()
        const providerKey = provider as 'openai' | 'anthropic' | 'gemini'
        store.incrementLLMCallCount(providerKey)
        if (typeof tokenUsage === 'number' && tokenUsage > 0) {
          store.trackTokenUsage(providerKey, tokenUsage)
        } else if (typeof tokenUsage === 'object' && tokenUsage.total_tokens) {
          store.trackTokenUsage(providerKey, tokenUsage.total_tokens)
        }
      }
    }

    return response
  },
  (error) => {
    // Handle connection refused error (backend crash/restart)
    if (error.code === 'ERR_CONNECTION_REFUSED' || error.code === 'ECONNREFUSED') {
      console.error('[API Client] Backend connection refused. Server may be restarting...')
      // Set a flag in appStore to show user-friendly message
      useAppStore.getState().setBackendError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')

      // Auto-clear error after 5 seconds (backend may auto-restart)
      setTimeout(() => {
        useAppStore.getState().clearBackendError()
      }, 5000)
    }

    // Detect rate limiting
    const rateLimitInfo = detectRateLimit(error)
    if (rateLimitInfo.isRateLimited) {
      const retryAfterMs = (rateLimitInfo.retryAfterSeconds || 60) * 1000
      const rateLimitedUntil = new Date(Date.now() + retryAfterMs)

      useRateLimitStore.getState().setRateLimited(
        rateLimitedUntil,
        rateLimitInfo.provider || 'unknown',
        rateLimitInfo.message || undefined
      )
    }

    return Promise.reject(error)
  }
)

// Helper to detect provider from URL
function detectProviderFromUrl(url?: string): string | null {
  if (!url) return null

  if (url.includes('openai') || url.includes('gpt')) {
    return 'openai'
  }
  if (url.includes('anthropic') || url.includes('claude')) {
    return 'anthropic'
  }
  if (url.includes('gemini') || url.includes('google')) {
    return 'gemini'
  }
  if (url.includes('llm')) {
    return 'openai' // Default for LLM endpoints
  }

  return null
}

export default apiClient
