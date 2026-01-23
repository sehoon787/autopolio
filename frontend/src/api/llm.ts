import apiClient from './client'

export interface CLIStatus {
  tool: string
  installed: boolean
  version: string | null
  latest_version: string | null
  is_outdated: boolean
  path: string | null
  install_command: string
  platform: string | null
}

export interface LLMProvider {
  id: string
  name: string
  description: string
  configured: boolean
  is_primary: boolean
  models: string[]
  default_model: string
  selected_model: string
}

export interface LLMConfigResponse {
  preferred_llm: string
  openai_configured: boolean
  anthropic_configured: boolean
  gemini_configured: boolean
  openai_model: string
  anthropic_model: string
  gemini_model: string
  claude_code_status: CLIStatus
  gemini_cli_status: CLIStatus | null
  providers: LLMProvider[]
}

export interface LLMConfigUpdate {
  provider?: string
  openai_api_key?: string
  anthropic_api_key?: string
  gemini_api_key?: string
  openai_model?: string
  anthropic_model?: string
  gemini_model?: string
}

export interface APIKeyValidationResponse {
  valid: boolean
  error: string | null
  provider: string
}

export interface LLMProviderInfo {
  id: string
  name: string
  description: string
  models: string[]
  default_model: string
  docs_url: string
  has_cli: boolean
}

export const llmApi = {
  // Get LLM configuration and CLI status
  getConfig: (userId?: number) =>
    apiClient.get<LLMConfigResponse>('/llm/config', {
      params: userId ? { user_id: userId } : undefined,
    }),

  // Update LLM configuration (API keys and provider)
  updateConfig: (data: LLMConfigUpdate, userId?: number) =>
    apiClient.put<LLMConfigResponse>('/llm/config', data, {
      params: userId ? { user_id: userId } : undefined,
    }),

  // Validate an API key for a provider
  validateKey: (provider: string, apiKey: string) =>
    apiClient.post<APIKeyValidationResponse>(`/llm/validate/${provider}`, { api_key: apiKey }),

  // Get Claude Code CLI status
  getCLIStatus: () =>
    apiClient.get<CLIStatus>('/llm/cli/status'),

  // Get Gemini CLI status
  getGeminiCLIStatus: () =>
    apiClient.get<CLIStatus>('/llm/cli/gemini/status'),

  // Force refresh CLI status
  refreshCLI: () =>
    apiClient.post<CLIStatus>('/llm/cli/refresh'),

  // List available providers
  getProviders: () =>
    apiClient.get<LLMProviderInfo[]>('/llm/providers'),
}
