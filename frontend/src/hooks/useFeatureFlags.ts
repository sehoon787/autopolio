import { isElectron } from '@/lib/electron'
import { usePlanStore } from '@/stores/planStore'
import { USER_TIERS } from '@/constants/enums'

/**
 * Feature flags for conditional rendering based on environment and tier
 */
export function useFeatureFlags() {
  const tier = usePlanStore((s) => s.tier)

  // Electron desktop: all features unlocked
  if (isElectron()) {
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

  return {
    // Existing flags
    showCLIStatus: true,
    showAPIKeys: true,
    showLLMProviders: true,
    showModelSelection: true,
    showDesktopDownloadNotice: false,

    // Tier-based export flags
    canExportDocx: tier !== USER_TIERS.FREE,
    canExportPdf: tier === USER_TIERS.ENTERPRISE,
    canExportHtml: tier !== USER_TIERS.FREE,
  }
}
