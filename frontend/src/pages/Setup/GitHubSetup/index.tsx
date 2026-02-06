import { useAppStore } from '@/stores/appStore'
import { DesktopGitHubSetup } from './DesktopGitHubSetup'
import { WebGitHubSetup } from './WebGitHubSetup'

export default function GitHubSetup() {
  const { isElectronApp } = useAppStore()

  // Desktop app uses GitHub CLI for authentication
  if (isElectronApp) {
    return <DesktopGitHubSetup />
  }

  // Web uses OAuth App (requires .env configuration)
  return <WebGitHubSetup />
}
