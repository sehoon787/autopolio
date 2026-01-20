import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import SetupPage from '@/pages/Setup'
import GitHubSetup from '@/pages/Setup/GitHubSetup'
import CompaniesPage from '@/pages/Knowledge/Companies'
import ProjectsPage from '@/pages/Knowledge/Projects'
import ProjectDetailPage from '@/pages/Knowledge/ProjectDetail'
import TemplatesPage from '@/pages/Templates'
import GeneratePage from '@/pages/Generate'
import PipelinePage from '@/pages/Generate/Pipeline'
import DocumentsPage from '@/pages/Documents'
import DocumentPreviewPage from '@/pages/Documents/Preview'
import HistoryPage from '@/pages/History'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="setup/github" element={<GitHubSetup />} />
          <Route path="knowledge/companies" element={<CompaniesPage />} />
          <Route path="knowledge/projects" element={<ProjectsPage />} />
          <Route path="knowledge/projects/:id" element={<ProjectDetailPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="generate/pipeline" element={<PipelinePage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:id" element={<DocumentPreviewPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default App
