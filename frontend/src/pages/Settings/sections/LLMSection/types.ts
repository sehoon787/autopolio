import { LLMProvider, CLIStatus, APIKeyValidationResponse } from '@/api/llm'

// Re-export types from API
export type { CLIStatus, LLMProvider, APIKeyValidationResponse }

// Default providers data (fallback when API fails)
export const DEFAULT_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4 and GPT-3.5 models for text generation',
    configured: false,
    env_configured: false,
    user_configured: false,
    is_primary: true,
    models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
    default_model: 'gpt-4-turbo-preview',
    selected_model: 'gpt-4-turbo-preview',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for text generation',
    configured: false,
    env_configured: false,
    user_configured: false,
    is_primary: false,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    default_model: 'claude-3-5-sonnet-20241022',
    selected_model: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini models for text generation',
    configured: false,
    env_configured: false,
    user_configured: false,
    is_primary: false,
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    default_model: 'gemini-2.0-flash',
    selected_model: 'gemini-2.0-flash',
  },
]

export interface TestResult {
  type: 'success' | 'error'
  message: string
}

export interface CurrentSelection {
  type: 'CLI' | 'API'
  name: string
  installed?: boolean
  version?: string | null
  configured?: boolean
  model?: string
}
