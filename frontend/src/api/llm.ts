import apiClient from './client'

export interface CLIStatus {
  tool: string
  installed: boolean
  version: string | null
  latest_version: string | null
  is_outdated: boolean
  path: string | null
  install_command: string
  update_command: string | null
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
  codex_cli_status: CLIStatus | null
  providers: LLMProvider[]
  runtime: string
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
  provider?: string
  token_usage?: number
  tokens?: number
  auth_status?: 'authenticated' | 'auth_failed' | 'unknown'
}

export interface CLIConnectResponse {
  success: boolean
  message: string
  provider?: string
  env_var?: string
}

export interface LLMTestRequest {
  api_key?: string
  model?: string
}

export interface LLMTestResponse {
  success: boolean
  provider: string
  model: string
  response: string
  token_usage?: number
}

// CLI Native Auth (web-local mode)
export interface CLIAuthStatusResponse {
  authenticated: boolean
  method?: 'oauth' | 'api_key'
  email?: string
  account?: string
  error?: string
}

export interface CLILoginResponse {
  success: boolean
  url?: string
  message?: string
  device_code?: string
}

export interface CLILogoutResponse {
  success: boolean
  message?: string
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

  // Get Codex CLI status
  getCodexCLIStatus: () =>
    apiClient.get<CLIStatus>('/llm/cli/codex/status'),

  // Force refresh CLI status
  refreshCLI: () =>
    apiClient.post<CLIStatus>('/llm/cli/refresh'),

  // List available providers
  getProviders: () =>
    apiClient.get<LLMProviderInfo[]>('/llm/providers'),

  // Test CLI tool (with optional model parameter)
  testCLI: (cliType: 'claude_code' | 'gemini_cli' | 'codex_cli', model?: string) =>
    apiClient.post<CLITestResponse>(`/llm/cli/test/${cliType}`, null, {
      params: model ? { model } : undefined,
    }),

  // Connect CLI tool (save API key to .env)
  connectCLI: (cliType: 'claude_code' | 'gemini_cli' | 'codex_cli', apiKey: string) =>
    apiClient.post<CLIConnectResponse>(`/llm/cli/connect/${cliType}`, { api_key: apiKey }),

  // Disconnect CLI tool (remove API key from .env)
  disconnectCLI: (cliType: 'claude_code' | 'gemini_cli' | 'codex_cli') =>
    apiClient.post<CLIConnectResponse>(`/llm/cli/disconnect/${cliType}`),

  // CLI Native Auth (web-local mode)
  getCLIAuthStatus: (cliType: string) =>
    apiClient.get<CLIAuthStatusResponse>(`/llm/cli/auth/${cliType}`),

  startCLILogin: (cliType: string) =>
    apiClient.post<CLILoginResponse>(`/llm/cli/auth/${cliType}/login`),

  cancelCLILogin: () =>
    apiClient.post(`/llm/cli/auth/cancel`),

  submitAuthCode: (code: string) =>
    apiClient.post<{ success: boolean; message?: string }>(`/llm/cli/auth/submit-code`, { code }),

  cliLogout: (cliType: string) =>
    apiClient.post<CLILogoutResponse>(`/llm/cli/auth/${cliType}/logout`),

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
}
