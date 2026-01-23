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
    // Track API call
    useUsageStore.getState().incrementApiCall()

    // Track token usage if present in response
    const tokenUsage = response.data?.token_usage || response.data?.usage
    if (tokenUsage) {
      const provider = response.data?.provider || detectProviderFromUrl(response.config.url)
      if (provider && typeof tokenUsage === 'number') {
        useUsageStore.getState().trackTokenUsage(provider as 'openai' | 'anthropic' | 'gemini', tokenUsage)
      } else if (tokenUsage.total_tokens) {
        const providerKey = provider || 'openai'
        useUsageStore.getState().trackTokenUsage(providerKey as 'openai' | 'anthropic' | 'gemini', tokenUsage.total_tokens)
      }
    }

    return response
  },
  (error) => {
    // Track API call even on error
    useUsageStore.getState().incrementApiCall()

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
