import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAppStore } from '@/stores/appStore'
import { useUserStore } from '@/stores/userStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { usersApi } from '@/api/users'
import { githubApi } from '@/api/github'
import { isElectron } from '@/lib/electron'
import { externalBackendUrl } from '@/config/runtime'
import { STORAGE_KEYS } from '@/constants'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import SetupPage from '@/pages/Setup'
import GitHubSetup from '@/pages/Setup/GitHubSetup'
import CompaniesPage from '@/pages/Knowledge/Companies'
import ProjectsPage from '@/pages/Knowledge/Projects'
import ProjectDetailPage from '@/pages/Knowledge/ProjectDetail'
import CompanyTimelinePage from '@/pages/Knowledge/CompanyTimeline'
import CredentialsPage from '@/pages/Knowledge/Credentials'
import EducationPublicationsPatentsPage from '@/pages/Knowledge/EducationPublicationsPatents'
import CertificationsAwardsPage from '@/pages/Knowledge/CertificationsAwards'
import ActivitiesPage from '@/pages/Knowledge/Activities'
import TemplatesPage from '@/pages/Templates'
import TemplateEditor from '@/pages/Templates/Editor'
import PlatformsPage from '@/pages/Platforms'
import PlatformExportPage from '@/pages/Platforms/Export'
import PlatformPreviewPage from '@/pages/Platforms/Preview'
import GeneratePage from '@/pages/Generate'
import PipelinePage from '@/pages/Generate/Pipeline'
import DocumentsPage from '@/pages/Documents'
import DocumentPreviewPage from '@/pages/Documents/Preview'
import HistoryPage from '@/pages/History'
import SettingsPage from '@/pages/Settings'
import RepoSelectorPage from '@/pages/GitHub/RepoSelector'

function App() {
  const initialize = useAppStore((state) => state.initialize)
  const { setUser } = useUserStore()
  const [isInitializing, setIsInitializing] = useState(true)
  const [backendReady, setBackendReady] = useState(!isElectron()) // Web: ready immediately (Vite proxy), Electron: wait for backend
  const queryClient = useQueryClient()

  useEffect(() => {
    // Initialize app store (detect Electron, set backend URL, etc.)
    initialize()
  }, [initialize])

  // Electron: Wait for backend to be ready before making any API calls
  useEffect(() => {
    if (!isElectron()) return // Web mode: backend is always available via proxy

    const { backendUrl } = useAppStore.getState()
    const healthUrl = `${backendUrl || externalBackendUrl}/health`

    let cancelled = false
    const waitForBackend = async () => {
      const maxAttempts = 30 // 30 seconds
      for (let i = 0; i < maxAttempts; i++) {
        if (cancelled) return
        try {
          const response = await fetch(healthUrl)
          if (response.ok) {
            console.log(`[App] Backend ready after ${i + 1} attempt(s)`)
            setBackendReady(true)
            return
          }
        } catch {
          // Backend not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      // Timed out but still set ready to allow error handling to kick in
      console.warn('[App] Backend health check timed out after 30s, proceeding anyway')
      setBackendReady(true)
    }

    waitForBackend()
    return () => { cancelled = true }
  }, [])

  // Validate stored user or start in guest mode (only after backend is ready)
  useEffect(() => {
    if (!backendReady) return // Wait for backend

    const initUser = async () => {
      try {
        // Clear any stale persisted data first
        const storedUserId = localStorage.getItem(STORAGE_KEYS.USER_ID)
        const parsedUserId = storedUserId ? parseInt(storedUserId, 10) : NaN

        // If stored user_id is invalid, clear it
        if (storedUserId && (isNaN(parsedUserId) || parsedUserId <= 0)) {
          console.log('[App] Invalid stored user_id, clearing:', storedUserId)
          localStorage.removeItem(STORAGE_KEYS.USER_ID)
          localStorage.removeItem(STORAGE_KEYS.USER_STORAGE) // Clear Zustand persisted state
        }

        // Re-read after potential cleanup
        const validStoredUserId = localStorage.getItem(STORAGE_KEYS.USER_ID)

        if (validStoredUserId) {
          try {
            // Try to fetch existing user from backend
            const response = await usersApi.getById(Number(validStoredUserId))
            if (response.data && response.data.id) {
              // Verify the returned ID matches what we requested
              if (response.data.id !== Number(validStoredUserId)) {
                console.log('[App] User ID mismatch, clearing stale data')
                localStorage.removeItem(STORAGE_KEYS.USER_ID)
                localStorage.removeItem(STORAGE_KEYS.USER_STORAGE)
                setUser(null)
              } else {
                console.log('[App] Found existing user:', response.data.id, response.data.name)
                setUser(response.data)
                setIsInitializing(false)

                // Background prefetch: GitHub repos
                if (response.data.github_username) {
                  githubApi.getStatus(response.data.id).then((statusRes) => {
                    if (statusRes.data?.connected && statusRes.data?.valid) {
                      queryClient.prefetchQuery({
                        queryKey: ['github-repos', response.data.id, 'backend'],
                        queryFn: () => githubApi.getRepos(response.data.id, true),
                        staleTime: 5 * 60 * 1000,
                      })
                    }
                  }).catch(() => {}) // Prefetch failure is non-critical
                }

                return
              }
            }
          } catch (fetchError) {
            // User doesn't exist in backend, clear stale data
            console.log('[App] Stored user not found in backend, clearing stale data')
            localStorage.removeItem(STORAGE_KEYS.USER_ID)
            localStorage.removeItem(STORAGE_KEYS.USER_STORAGE) // Clear Zustand persisted state
            setUser(null)
          }
        }

        // No stored user - start in guest mode for both web and desktop
        // User will be created when they connect to GitHub or manually create a profile
        console.log('[App] No stored user, starting in guest mode')
        setIsInitializing(false)
      } catch (error) {
        console.error('[App] Failed to initialize user:', error)
      } finally {
        setIsInitializing(false)
      }
    }

    initUser()
  }, [setUser, backendReady])

  // Global analysis polling - keeps Calls/Tokens updated regardless of current page
  useEffect(() => {
    if (isInitializing) return
    const user = useUserStore.getState().user
    if (!user?.id) return

    const { startPolling, stopPolling } = useAnalysisStore.getState()
    startPolling(user.id)

    return () => stopPolling()
  }, [isInitializing])

  // Auto-sync GitHub CLI token on Electron startup
  useEffect(() => {
    const syncGitHubCLI = async () => {
      // Only run in Electron after initialization
      console.log('[App syncGitHubCLI] Starting... isElectron:', isElectron(), 'isInitializing:', isInitializing)
      if (!isElectron() || isInitializing) {
        console.log('[App syncGitHubCLI] Skipped: not Electron or still initializing')
        return
      }
      if (!window.electron) {
        console.log('[App syncGitHubCLI] Skipped: window.electron not available')
        return
      }

      try {
        // Check if GitHub CLI is authenticated
        console.log('[App syncGitHubCLI] Checking GitHub CLI status...')
        const status = await window.electron.getGitHubCLIStatus()
        console.log('[App syncGitHubCLI] GitHub CLI status:', JSON.stringify(status))
        
        if (!status.authenticated || !status.username) {
          console.log('[App syncGitHubCLI] GitHub CLI not authenticated, skipping auto-sync')
          return
        }

        console.log('[App syncGitHubCLI] GitHub CLI authenticated as:', status.username)

        // Get token from CLI FIRST (before checking user status)
        console.log('[App syncGitHubCLI] Getting GitHub token from CLI...')
        const tokenResult = await window.electron.getGitHubToken()
        console.log('[App syncGitHubCLI] Token result:', tokenResult.success ? 'success' : 'failed', tokenResult.error || '')
        
        if (!tokenResult.success || !tokenResult.token) {
          console.warn('[App syncGitHubCLI] Failed to get GitHub token from CLI:', tokenResult.error)
          return
        }

        // Get current user from store
        const currentUser = useUserStore.getState().user
        console.log('[App syncGitHubCLI] Current user:', currentUser?.id, currentUser?.name)
        
        // If we have a user, check if GitHub token is already synced AND valid
        if (currentUser?.id) {
          try {
            const githubStatus = await githubApi.getStatus(currentUser.id)
            console.log('[App syncGitHubCLI] Backend GitHub status:', JSON.stringify(githubStatus.data))
            if (githubStatus.data.connected && githubStatus.data.valid) {
              console.log('[App syncGitHubCLI] GitHub token already synced and valid, skipping')
              return
            }
            console.log('[App syncGitHubCLI] Token not synced or invalid, will sync now')
          } catch (statusError) {
            // Status check failed, try to sync token anyway
            console.log('[App syncGitHubCLI] Status check failed, will try to sync token:', statusError)
          }
        }

        // Create or update user with GitHub info
        let userId: number
        if (currentUser?.id) {
          // Update existing user
          console.log('[App syncGitHubCLI] Updating existing user:', currentUser.id)
          const response = await usersApi.update(currentUser.id, {
            github_username: status.username,
          })
          useUserStore.getState().setUser(response.data)
          userId = response.data.id
        } else {
          // No stored user - try to find existing user by github_username first
          console.log('[App syncGitHubCLI] No stored user, looking for existing user with github_username:', status.username)
          try {
            const allUsers = await usersApi.getAll()
            const existingUser = allUsers.data?.find(
              (u: { github_username: string | null }) => u.github_username === status.username
            )
            if (existingUser) {
              console.log('[App syncGitHubCLI] Found existing user:', existingUser.id, existingUser.name)
              useUserStore.getState().setUser(existingUser)
              localStorage.setItem(STORAGE_KEYS.USER_ID, String(existingUser.id))
              userId = existingUser.id
            } else {
              // Create new user (no existing user with this github_username)
              console.log('[App syncGitHubCLI] Creating new user for:', status.username)
              const response = await usersApi.create({
                name: status.username,
                github_username: status.username,
              })
              useUserStore.getState().setUser(response.data)
              localStorage.setItem(STORAGE_KEYS.USER_ID, String(response.data.id))
              userId = response.data.id
              console.log('[App syncGitHubCLI] Created new user with ID:', userId)
            }
          } catch (lookupError) {
            console.error('[App syncGitHubCLI] Failed to find/create user:', lookupError)
            return
          }
        }

        // Save token to backend
        try {
          console.log('[App syncGitHubCLI] Saving token to backend for user:', userId)
          const saveResult = await githubApi.saveToken(userId, tokenResult.token)
          console.log('[App syncGitHubCLI] Token saved successfully:', JSON.stringify(saveResult.data))
          
          // Update user store with GitHub info if returned
          if (saveResult.data.github_username) {
            const updatedUser = useUserStore.getState().user
            if (updatedUser) {
              useUserStore.getState().setUser({
                ...updatedUser,
                github_username: saveResult.data.github_username,
                github_avatar_url: saveResult.data.github_avatar_url || null,
              })
            }
          }
          
          // Invalidate GitHub status and repos queries to reflect the new connection
          console.log('[App syncGitHubCLI] Invalidating GitHub queries...')
          queryClient.invalidateQueries({ queryKey: ['github-status'] })
          queryClient.invalidateQueries({ queryKey: ['github-repos'] })
        } catch (saveError) {
          console.error('[App syncGitHubCLI] Failed to save GitHub token:', saveError)
        }
      } catch (error) {
        console.error('[App syncGitHubCLI] GitHub CLI auto-sync failed:', error)
      }
    }

    syncGitHubCLI()
  }, [isInitializing])

  // Show loading while initializing
  if (!backendReady || isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground">
            {!backendReady ? 'Starting backend server...' : 'Initializing...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="setup/github" element={<GitHubSetup />} />
          <Route path="github/repos" element={<RepoSelectorPage />} />
          <Route path="knowledge/companies" element={<CompaniesPage />} />
          <Route path="knowledge/projects" element={<ProjectsPage />} />
          <Route path="knowledge/projects/:id" element={<ProjectDetailPage />} />
          <Route path="knowledge/projects/kanban" element={<Navigate to="/knowledge/projects" replace />} />
          <Route path="knowledge/companies/timeline" element={<CompanyTimelinePage />} />
          <Route path="knowledge/credentials" element={<CredentialsPage />} />
          <Route path="knowledge/education-publications-patents" element={<EducationPublicationsPatentsPage />} />
          <Route path="knowledge/certifications-awards" element={<CertificationsAwardsPage />} />
          <Route path="knowledge/activities" element={<ActivitiesPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="templates/:templateId/edit" element={<TemplateEditor />} />
          <Route path="platforms" element={<PlatformsPage />} />
          <Route path="platforms/:templateId/export" element={<PlatformExportPage />} />
          <Route path="platforms/:templateId/preview" element={<PlatformPreviewPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="generate/pipeline" element={<PipelinePage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:id" element={<DocumentPreviewPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </ErrorBoundary>
  )
}

export default App
