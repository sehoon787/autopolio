import apiClient from './client'

// ===== Types =====

export interface OAuthIdentity {
  id: number
  provider: string
  username?: string
  email?: string
  avatar_url?: string
  is_primary: boolean
  created_at: string
}

export interface OAuthConnectResponse {
  auth_url: string
  provider: string
}

export interface ProviderInfo {
  name: string
  configured: boolean
  display_name: string
}

// ===== API Functions =====

export const oauthApi = {
  /**
   * Get list of available OAuth providers with their configuration status
   */
  getProviders: () =>
    apiClient.get<{ providers: ProviderInfo[] }>('/oauth/providers'),

  /**
   * Start OAuth flow for a provider
   */
  connect: (
    provider: string,
    redirectPath: string = '/setup/github',
    isElectron: boolean = false,
    userId?: number
  ) =>
    apiClient.get<OAuthConnectResponse>(`/oauth/${provider}/connect`, {
      params: {
        redirect_path: redirectPath,
        is_electron: isElectron,
        user_id: userId,
        frontend_origin: window.location.origin,
      },
    }),

  /**
   * Disconnect an OAuth provider from user's account
   */
  disconnect: (provider: string, userId: number) =>
    apiClient.delete<{ success: boolean; message: string }>(
      `/oauth/${provider}/disconnect`,
      { params: { user_id: userId } }
    ),

  /**
   * Get all OAuth identities for a user
   */
  getIdentities: (userId: number) =>
    apiClient.get<{ identities: OAuthIdentity[] }>('/oauth/identities', {
      params: { user_id: userId },
    }),

  /**
   * Set an OAuth provider as the primary login method
   */
  setPrimary: (provider: string, userId: number) =>
    apiClient.put<{ success: boolean; message: string }>(
      `/oauth/${provider}/set-primary`,
      null,
      { params: { user_id: userId } }
    ),
}

export default oauthApi
