/**
 * Feature flags for conditional rendering based on environment
 */
export function useFeatureFlags() {
  return {
    // CLI status — available in both web (via backend API) and Electron (via IPC)
    showCLIStatus: true,

    // API keys — available in both modes
    showAPIKeys: true,

    // LLM provider selection is always visible
    showLLMProviders: true,

    // Model selection is always visible
    showModelSelection: true,

    // Desktop download notice — no longer needed since CLI works in web mode
    showDesktopDownloadNotice: false,
  }
}
