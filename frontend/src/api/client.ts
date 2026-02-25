import axios from 'axios'
import { useAppStore } from '@/stores/appStore'
import { useUsageStore } from '@/stores/usageStore'
import { useRateLimitStore } from '@/stores/rateLimitStore'
import { detectRateLimit } from '@/lib/rateLimitDetector'
import i18n from '@/lib/i18n'

// Default timeout for most API calls (30 seconds)
const DEFAULT_TIMEOUT = 30000

// Extended timeout for long-running operations like CLI/LLM analysis (5 minutes)
export const ANALYSIS_TIMEOUT = 300000

const apiClient = axios.create({
  baseURL: '/api',
  timeout: DEFAULT_TIMEOUT,
  // Don't set default Content-Type - let axios set it automatically based on request data
  // For JSON requests, axios will set it to application/json
  // For FormData requests, axios will set it to multipart/form-data with correct boundary
})

// Dynamic base URL interceptor for Electron/Web dual mode
apiClient.interceptors.request.use(async (config) => {
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

  if (!isNaN(parsedUserId) && parsedUserId > 0) {
    if (config.params) {
      config.params.user_id = parsedUserId
    } else {
      config.params = { user_id: parsedUserId }
    }
  }

  return config
})

// Map provider string to usage store key
function mapProviderToUsageKey(provider: string): keyof import('@/stores/usageStore').LLMUsage | null {
  // Handle CLI providers (e.g., "cli:claude_code", "cli:gemini_cli")
  if (provider.startsWith('cli:')) {
    const cliType = provider.replace('cli:', '')
    if (cliType === 'claude_code') return 'claude_code_cli'
    if (cliType === 'gemini_cli') return 'gemini_cli'
  }
  // Handle API providers
  if (provider === 'openai') return 'openai'
  if (provider === 'anthropic') return 'anthropic'
  if (provider === 'gemini') return 'gemini'
  return null
}

// Response interceptor for usage tracking and rate limit detection
apiClient.interceptors.response.use(
  (response) => {
    // Track usage based on provider in response (CLI/API agnostic)
    const explicitProvider = response.data?.provider
    const tokenUsage = response.data?.token_usage ?? response.data?.usage

    // Only track usage when token_usage is present (indicates actual LLM call, not validation/status checks)
    if (tokenUsage !== undefined && tokenUsage !== null) {
      let providerKey: keyof import('@/stores/usageStore').LLMUsage | null = null

      if (explicitProvider) {
        providerKey = mapProviderToUsageKey(explicitProvider)
      }
      if (!providerKey) {
        const urlProvider = detectProviderFromUrl(response.config.url)
        providerKey = urlProvider ? mapProviderToUsageKey(urlProvider) : null
      }

      if (providerKey) {
        const store = useUsageStore.getState()
        console.debug('[Usage Tracking]', { url: response.config.url, provider: providerKey, tokenUsage })

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
    // Handle timeout error (ECONNABORTED is Axios timeout code)
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.error('[API Client] Request timeout:', error.config?.url)
      // Enhance error message for better user feedback (i18n)
      error.message = i18n.t('errors.timeout', { ns: 'common' })
    }

    // Handle connection refused error (backend crash/restart)
    if (error.code === 'ERR_CONNECTION_REFUSED' || error.code === 'ECONNREFUSED') {
      console.error('[API Client] Backend connection refused. Server may be restarting...')
      // Set a flag in appStore to show user-friendly message (i18n)
      useAppStore.getState().setBackendError(i18n.t('errors.connectionRefused', { ns: 'common' }))

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
