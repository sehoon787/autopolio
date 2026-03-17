/**
 * Feature flags for conditional rendering based on environment.
 * All features are now unlocked (tier/plan system removed for open source).
 */
export function useFeatureFlags() {
  return {
    showCLIStatus: true,
    showAPIKeys: true,
    showLLMProviders: true,
    showModelSelection: true,
    showDesktopDownloadNotice: false,
    canExportDocx: true,
    canExportPdf: true,
    canExportHtml: true,
  }
}
