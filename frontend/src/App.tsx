import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAppStore } from '@/stores/appStore'
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
import GeneratePage from '@/pages/Generate'
import PipelinePage from '@/pages/Generate/Pipeline'
import DocumentsPage from '@/pages/Documents'
import DocumentPreviewPage from '@/pages/Documents/Preview'
import HistoryPage from '@/pages/History'
import SettingsPage from '@/pages/Settings'
import RepoSelectorPage from '@/pages/GitHub/RepoSelector'

function App() {
  const initialize = useAppStore((state) => state.initialize)

  useEffect(() => {
    // Initialize app store (detect Electron, set backend URL, etc.)
    initialize()
  }, [initialize])

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
