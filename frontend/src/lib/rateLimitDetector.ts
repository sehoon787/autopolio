/**
 * Rate Limit Detection Utility
 * Detects rate limit errors from various LLM providers
 */

export interface RateLimitInfo {
  isRateLimited: boolean
  provider: string | null
  retryAfterSeconds: number | null
  message: string | null
}

// Known rate limit error patterns
const RATE_LIMIT_PATTERNS = [
  // OpenAI patterns
  { pattern: /rate_limit_exceeded/i, provider: 'openai' },
  { pattern: /too many requests/i, provider: 'generic' },
  { pattern: /rate limit/i, provider: 'generic' },
  { pattern: /quota exceeded/i, provider: 'generic' },
  { pattern: /requests per minute/i, provider: 'generic' },
  { pattern: /tokens per minute/i, provider: 'openai' },

  // Anthropic patterns
  { pattern: /overloaded/i, provider: 'anthropic' },
  { pattern: /rate_limit/i, provider: 'anthropic' },

  // Gemini patterns
  { pattern: /RESOURCE_EXHAUSTED/i, provider: 'gemini' },
  { pattern: /quota/i, provider: 'generic' },
]

// Extract retry-after time from error message
const RETRY_AFTER_PATTERNS = [
  /retry after (\d+) seconds/i,
  /wait (\d+) seconds/i,
  /try again in (\d+)/i,
  /(\d+) seconds/i,
]

export function detectRateLimit(error: unknown): RateLimitInfo {
  const result: RateLimitInfo = {
    isRateLimited: false,
    provider: null,
    retryAfterSeconds: null,
    message: null,
  }

  // Handle axios errors
  if (error && typeof error === 'object') {
    const axiosError = error as {
      response?: {
        status?: number
        data?: { error?: string; message?: string; detail?: string }
        headers?: { 'retry-after'?: string }
      }
      message?: string
    }

    // Check HTTP status code
    if (axiosError.response?.status === 429) {
      result.isRateLimited = true
      result.message = 'Rate limit exceeded (HTTP 429)'

      // Try to get retry-after from headers
      const retryAfterHeader = axiosError.response.headers?.['retry-after']
      if (retryAfterHeader) {
        result.retryAfterSeconds = parseInt(retryAfterHeader, 10)
      }
    }

    // Check error message patterns
    const errorMessage =
      axiosError.response?.data?.error ||
      axiosError.response?.data?.message ||
      axiosError.response?.data?.detail ||
      axiosError.message ||
      ''

    if (typeof errorMessage === 'string') {
      result.message = errorMessage

      // Detect provider from error message
      for (const { pattern, provider } of RATE_LIMIT_PATTERNS) {
        if (pattern.test(errorMessage)) {
          result.isRateLimited = true
          result.provider = provider
          break
        }
      }

      // Extract retry-after time from message
      if (result.isRateLimited && !result.retryAfterSeconds) {
        for (const pattern of RETRY_AFTER_PATTERNS) {
          const match = errorMessage.match(pattern)
          if (match) {
            result.retryAfterSeconds = parseInt(match[1], 10)
            break
          }
        }
      }
    }
  }

  // Default retry time if rate limited but no specific time given
  if (result.isRateLimited && !result.retryAfterSeconds) {
    result.retryAfterSeconds = 60 // Default to 60 seconds
  }

  return result
}

export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return `${hours}h ${remainingMinutes}m`
}
