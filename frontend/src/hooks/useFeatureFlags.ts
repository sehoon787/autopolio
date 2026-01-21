import { useAppStore } from '@/stores/appStore'

/**
 * Feature flags for conditional rendering based on environment
 */
export function useFeatureFlags() {
  const { isElectronApp } = useAppStore()

  return {
    // CLI status is only relevant in Electron (desktop app)
    // since CLI tools need local system access
    showCLIStatus: isElectronApp,

    // API keys should only be configured in Electron
    // for security reasons (browser storage is less secure)
    showAPIKeys: isElectronApp,

    // LLM provider selection is always visible
    // (but API key input is hidden in web mode)
    showLLMProviders: true,

    // Model selection is always visible
    showModelSelection: true,

    // Desktop download notice for web mode
    showDesktopDownloadNotice: !isElectronApp,
  }
}
