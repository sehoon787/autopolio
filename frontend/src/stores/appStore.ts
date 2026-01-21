import { create } from 'zustand'
import { isElectron, getBackendUrl, getPlatform, getAppVersion } from '@/lib/electron'

interface AppState {
  // App environment
  isElectronApp: boolean
  backendUrl: string
  platform: string
  appVersion: string

  // Initialization state
  isInitialized: boolean

  // Actions
  initialize: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  isElectronApp: false,
  backendUrl: '',
  platform: 'web',
  appVersion: 'web',
  isInitialized: false,

  // Initialize the app store
  initialize: async () => {
    if (get().isInitialized) {
      return
    }

    const isElectronApp = isElectron()
    const [backendUrl, platform, appVersion] = await Promise.all([
      getBackendUrl(),
      getPlatform(),
      getAppVersion(),
    ])

    set({
      isElectronApp,
      backendUrl,
      platform,
      appVersion,
      isInitialized: true,
    })

    console.log('App initialized:', {
      isElectronApp,
      backendUrl: backendUrl || '(proxy)',
      platform,
      appVersion,
    })
  },
}))
