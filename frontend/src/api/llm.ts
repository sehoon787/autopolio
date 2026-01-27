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
  env_configured: boolean  // Whether API key is set in server .env
  user_configured: boolean // Whether API key is set by user
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

export interface CLITestResponse {
  success: boolean
  tool: string
  message: string
  output?: string
}

export interface LLMTestRequest {
  api_key?: string
  model?: string
}

export interface StoredAPIKeysResponse {
  openai_api_key: string | null
  anthropic_api_key: string | null
  gemini_api_key: string | null
}

export interface LLMTestResponse {
  success: boolean
  provider: string
  model: string
  response: string
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

  // Test CLI tool
  testCLI: (cliType: 'claude_code' | 'gemini_cli') =>
    apiClient.post<CLITestResponse>(`/llm/cli/test/${cliType}`),

  // Test LLM provider
  // api_key: directly test with this key (without saving)
  // use_env: true for Web (use .env API keys), false for Electron (user-configured keys only)
  testProvider: (providerId: string, options?: {
    userId?: number
    useEnv?: boolean
    apiKey?: string
    model?: string
  }) => {
    const { userId, useEnv = true, apiKey, model } = options || {}
    const requestBody: LLMTestRequest | null = apiKey ? { api_key: apiKey, model } : null

    return apiClient.post<LLMTestResponse>(`/llm/test/${providerId}`, requestBody, {
      params: {
        ...(userId ? { user_id: userId } : {}),
        use_env: useEnv,
      },
    })
  },

  // Get stored (decrypted) API keys for the user (Electron/desktop only)
  getStoredKeys: (userId: number) =>
    apiClient.get<StoredAPIKeysResponse>('/llm/keys', {
      params: { user_id: userId },
    }),
}
