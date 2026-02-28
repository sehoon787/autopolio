import { LLMProvider, CLIStatus } from '@/api/llm'

// Re-export types from API
export type { CLIStatus, LLMProvider }

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
    models: ['gpt-4.1', 'gpt-4o', 'gpt-4-turbo-preview'],
    default_model: 'gpt-4.1',
    selected_model: 'gpt-4.1',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for text generation',
    configured: false,
    env_configured: false,
    user_configured: false,
    is_primary: false,
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'],
    default_model: 'claude-sonnet-4-20250514',
    selected_model: 'claude-sonnet-4-20250514',
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
