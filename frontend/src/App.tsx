import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAppStore } from '@/stores/appStore'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/api/users'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import SetupPage from '@/pages/Setup'
import GitHubSetup from '@/pages/Setup/GitHubSetup'
import CompaniesPage from '@/pages/Knowledge/Companies'
import ProjectsPage from '@/pages/Knowledge/Projects'
import ProjectDetailPage from '@/pages/Knowledge/ProjectDetail'
import CompanyTimelinePage from '@/pages/Knowledge/CompanyTimeline'
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
  const isElectronApp = useAppStore((state) => state.isElectronApp)
  const { setUser } = useUserStore()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    // Initialize app store (detect Electron, set backend URL, etc.)
    initialize()
  }, [initialize])

  // Auto-create/validate user for both web and desktop app
  useEffect(() => {
    const initUser = async () => {
      try {
        // Clear any stale persisted data first
        const storedUserId = localStorage.getItem('user_id')
        const parsedUserId = storedUserId ? parseInt(storedUserId, 10) : NaN

        // If stored user_id is invalid, clear it
        if (storedUserId && (isNaN(parsedUserId) || parsedUserId <= 0)) {
          console.log('[App] Invalid stored user_id, clearing:', storedUserId)
          localStorage.removeItem('user_id')
          localStorage.removeItem('user-storage') // Clear Zustand persisted state
        }

        // Re-read after potential cleanup
        const validStoredUserId = localStorage.getItem('user_id')

        if (validStoredUserId) {
          try {
            // Try to fetch existing user from backend
            const response = await usersApi.getById(Number(validStoredUserId))
            if (response.data && response.data.id) {
              console.log('[App] Found existing user:', response.data.id, response.data.name)
              setUser(response.data)
              setIsInitializing(false)
              return
            }
          } catch (fetchError) {
            // User doesn't exist in backend, clear stale data
            console.log('[App] Stored user not found in backend, clearing stale data')
            localStorage.removeItem('user_id')
            localStorage.removeItem('user-storage') // Clear Zustand persisted state
            setUser(null)
          }
        }

        // For web mode without stored user, just finish initialization
        if (!isElectronApp) {
          setIsInitializing(false)
          return
        }

        // Create default user for desktop app
        console.log('[App] Creating default desktop user...')
        const response = await usersApi.create({
          name: 'Desktop User',
        })

        if (response.data && response.data.id) {
          setUser(response.data)
          localStorage.setItem('user_id', String(response.data.id))
          console.log('[App] Created default desktop user:', response.data.id, response.data.name)
        }
      } catch (error) {
        console.error('[App] Failed to initialize user:', error)
      } finally {
        setIsInitializing(false)
      }
    }

    initUser()
  }, [isElectronApp, setUser])

  // Show loading while initializing user in desktop mode
  if (isInitializing && isElectronApp) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground">Initializing...</p>
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
