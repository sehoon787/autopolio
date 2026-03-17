/**
 * useProjectsPage - Custom hook for Projects page state and logic
 * Extracts all state management, queries, mutations, and handlers from ProjectsPage
 */

import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore, resolveModelForAPI } from '@/stores/appStore'
import { useUsageStore } from '@/stores/usageStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { AI_MODES, CLI_TYPES } from '@/constants'
import { generateWithCLI } from '@/services/cliLLMService'
import { isElectron } from '@/lib/electron'
import { projectsApi, companiesApi, ProjectCreate, ProjectFilters as ProjectFiltersType, Project } from '@/api/knowledge'
import { githubApi, GitHubRepo } from '@/api/github'
import { useSelection } from '@/hooks/useSelection'
import { useProjectForm } from '@/hooks/useProjectForm'
import { countActiveFilters } from '@/components/ProjectFilters'
import {
  KanbanItem,
  KanbanColumn,
  PROJECT_STATUS_COLUMNS,
  createKanbanColumns,
} from '@/components/KanbanBoard'

// Kanban item interface
export interface ProjectKanbanItem extends KanbanItem {
  project: Project
}

// Map project status to kanban column ID
export function getColumnId(project: Project): string {
  if (project.is_analyzed) return 'completed'
  if (project.status) {
    const validStatuses = PROJECT_STATUS_COLUMNS.map(c => c.id)
    if (validStatuses.includes(project.status)) return project.status
  }
  return 'pending'
}

export function useProjectsPage() {
  const { t, i18n } = useTranslation('projects')
  const { t: tc } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  // Analysis store for background analysis tracking
  const {
    isAnalyzing,
    getProgress,
    getJob,
    startPolling,
    activeJobs,
    cancelAnalysis,
    startAnalysis,
  } = useAnalysisStore()

  // View and UI state
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [isLoadingRepoInfo, setIsLoadingRepoInfo] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<ProjectFiltersType>({ sort_by: 'updated_at', sort_order: 'desc' })
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters])

  // Selection state
  const selection = useSelection<number>()

  // Form hooks for create and edit
  const createForm = useProjectForm()
  const editForm = useProjectForm()
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false)

  // GitHub connection check
  const isGitHubConnected = !!user?.github_username

  // Ensure polling is running (App.tsx manages lifecycle, this just ensures it's started)
  useEffect(() => {
    if (user?.id) {
      startPolling(user.id)
    }
  }, [user?.id, startPolling])

  // Refetch projects when analysis jobs complete
  useEffect(() => {
    // Check if any jobs just completed
    const completedJobs = Array.from(activeJobs.values()).filter(
      job => job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
    )
    if (completedJobs.length > 0) {
      queryClient.refetchQueries({ queryKey: ['projects'] })
      completedJobs.forEach(job => {
        if (job.status === 'completed') {
          toast({ title: t('backgroundAnalysis.completed'), description: t('backgroundAnalysis.completedDesc') })
        } else if (job.status === 'failed') {
          toast({ title: t('backgroundAnalysis.failed'), description: t('backgroundAnalysis.failedDesc', { error: job.error_message }), variant: 'destructive' })
        }
      })
    }
  }, [activeJobs, queryClient, toast, t])

  // Queries
  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects', user?.id, filters],
    queryFn: () => projectsApi.getAll(user!.id, filters),
    enabled: !!user?.id,
  })

  const { data: companiesData } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: () => companiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const { data: reposData } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id && isGitHubConnected,
  })

  const projects = projectsData?.data?.projects || []
  const companies = companiesData?.data || []
  const githubRepos: GitHubRepo[] = (reposData?.data?.repos || []).slice().sort((a: GitHubRepo, b: GitHubRepo) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['projects'] })
      setIsDialogOpen(false)
      createForm.reset()
      toast({ title: t('projectAdded') })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast({ title: tc('error'), description: typeof detail === 'string' ? detail : t('addFailed'), variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(user!.id, id),
    onSuccess: () => { queryClient.refetchQueries({ queryKey: ['projects'] }); toast({ title: t('projectDeleted') }) },
    onError: (error: any) => toast({ title: tc('error'), description: error?.response?.data?.detail || t('deleteFailed'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProjectCreate> }) => projectsApi.update(user!.id, id, data),
    onSuccess: () => { queryClient.refetchQueries({ queryKey: ['projects'] }); setEditingProject(null); toast({ title: t('projectUpdated') }) },
    onError: (error: any) => toast({ title: tc('error'), description: error?.response?.data?.detail || t('updateFailed'), variant: 'destructive' }),
  })

  const batchDeleteMutation = useMutation({
    mutationFn: (projectIds: number[]) => projectsApi.deleteBatch(user!.id, projectIds),
    onSuccess: (response) => {
      const { deleted_count, not_found_ids } = response.data
      queryClient.refetchQueries({ queryKey: ['projects'] })
      selection.deselectAll()
      toast({ title: t('batchDeleteComplete'), description: t('batchDeleteResult', { count: deleted_count }), variant: not_found_ids.length > 0 ? 'destructive' : 'default' })
    },
    onError: (error: any) => {
      let errorMessage = t('batchDeleteFailed')
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') errorMessage = detail
      else if (Array.isArray(detail) && detail[0]?.msg) errorMessage = detail[0].msg
      toast({ title: tc('error'), description: errorMessage, variant: 'destructive' })
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => projectsApi.update(user!.id, id, { status }),
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['projects'] }),
    onError: () => toast({ title: tc('error'), description: t('statusChangeFailed'), variant: 'destructive' }),
  })

  // Individual batch analysis state
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false)

  // Start individual analyses for each project (to show individual status)
  const handleStartBatchAnalysis = async (projectsToAnalyze: Project[]) => {
    if (!user?.id || projectsToAnalyze.length === 0) return

    const { aiMode, selectedCLI, claudeCodeModel, geminiCLIModel, codexCLIModel, selectedLLMProvider } = useAppStore.getState()
    const useCli = aiMode === AI_MODES.CLI

    setIsBatchAnalyzing(true)
    setBatchProgress({ current: 0, total: projectsToAnalyze.length })

    let completed = 0
    let failed = 0

    for (const project of projectsToAnalyze) {
      const gitUrl = project.git_url || project.repositories?.find((r) => r.is_primary)?.git_url || project.repositories?.[0]?.git_url
      if (!gitUrl) {
        failed++
        continue
      }

      try {
        const options: Parameters<typeof startAnalysis>[3] = {
          language: i18n.language as 'ko' | 'en',
        }
        if (useCli) {
          options.cli_mode = selectedCLI
          const cliModel = selectedCLI === CLI_TYPES.CLAUDE_CODE ? claudeCodeModel : selectedCLI === CLI_TYPES.CODEX_CLI ? codexCLIModel : geminiCLIModel
          options.cli_model = resolveModelForAPI(cliModel)
        } else if (selectedLLMProvider) {
          options.provider = selectedLLMProvider
        }

        await startAnalysis(user.id, gitUrl, project.id, options)
        completed++
      } catch (error: any) {
        console.warn(`[Batch Analysis] ${project.name}: ${error?.message || 'Failed'}`)
        failed++
      }

      setBatchProgress({ current: completed + failed, total: projectsToAnalyze.length })
    }

    setBatchProgress(null)
    setIsBatchAnalyzing(false)
    selection.deselectAll()

    toast({
      title: t('batchAnalysisStarted'),
      description: t('batchAnalysisStartedResult', { count: completed }),
      variant: failed > 0 ? 'destructive' : 'default',
    })
  }

  // Handlers
  const clearFilters = () => { setFilters({ sort_by: 'updated_at', sort_order: 'desc' }); setSearchInput(''); selection.deselectAll() }
  const handleSearch = () => setFilters(prev => ({ ...prev, search: searchInput || undefined }))

  const handleRepoSelected = async (repoUrl: string) => {
    if (!repoUrl || !user?.id) return
    createForm.setFormData((prev) => ({ ...prev, git_url: repoUrl }))
    setIsLoadingRepoInfo(true)
    try {
      const [infoResponse, techResponse] = await Promise.all([githubApi.getRepoInfo(user.id, repoUrl), githubApi.detectTechnologies(user.id, repoUrl)])
      const info = infoResponse.data
      const technologies = techResponse.data.technologies || []
      createForm.setFormData((prev) => ({
        ...prev, short_description: info.description || prev.short_description, git_url: info.html_url || repoUrl,
        start_date: info.start_date || prev.start_date, end_date: info.end_date || '',
        team_size: info.team_size || prev.team_size, contribution_percent: info.contribution_percent || prev.contribution_percent,
        project_type: 'personal', technologies: technologies.length > 0 ? technologies : prev.technologies,
      }))
      createForm.setIsOngoing(!info.end_date)
      toast({ title: t('repoInfoLoaded') })
    } catch (error: any) { toast({ title: tc('error'), description: error?.response?.data?.detail || t('repoInfoFailed'), variant: 'destructive' }) }
    finally { setIsLoadingRepoInfo(false) }
  }

  const handleEditRepoSelected = async (repoUrl: string) => {
    if (!repoUrl || !user?.id) return
    editForm.setFormData((prev) => ({ ...prev, git_url: repoUrl }))
    setIsLoadingRepoInfo(true)
    try {
      const [infoResponse, techResponse] = await Promise.all([githubApi.getRepoInfo(user.id, repoUrl), githubApi.detectTechnologies(user.id, repoUrl)])
      const info = infoResponse.data
      const technologies = techResponse.data.technologies || []
      editForm.setFormData((prev) => ({
        ...prev, short_description: info.description || prev.short_description, git_url: info.html_url || repoUrl,
        start_date: info.start_date || prev.start_date, end_date: info.end_date || '',
        team_size: info.team_size || prev.team_size, contribution_percent: info.contribution_percent || prev.contribution_percent,
        technologies: technologies.length > 0 ? technologies : prev.technologies,
      }))
      editForm.setIsOngoing(!info.end_date)
      toast({ title: t('repoInfoLoaded') })
    } catch (error: any) { toast({ title: tc('error'), description: error?.response?.data?.detail || t('repoInfoFailed'), variant: 'destructive' }) }
    finally { setIsLoadingRepoInfo(false) }
  }

  const handleGenerateAI = async () => {
    if (!user?.id || !createForm.formData.git_url) { toast({ title: t('gitUrlRequired'), variant: 'destructive' }); return }
    const { aiMode, selectedCLI } = useAppStore.getState()
    const useDirectCli = aiMode === AI_MODES.CLI && isElectron()
    setIsGeneratingAI(true)
    try {
      if (useDirectCli) {
        const cli = selectedCLI as typeof CLI_TYPES.CLAUDE_CODE | typeof CLI_TYPES.GEMINI_CLI
        const prompt = `Analyze this GitHub repository and generate a project description for a resume/portfolio.\nRepository URL: ${createForm.formData.git_url}\nProject name: ${createForm.formData.name || 'Unknown'}\n\nReturn JSON with: { "short_description": "...", "description": "...", "technologies": ["..."] }`
        const result = await generateWithCLI(prompt, cli)
        if (!result.success) { toast({ title: t('aiGenerateError'), description: `CLI failed: ${result.error}. Try switching to API mode.`, variant: 'destructive' }); return }
        const providerKey = cli === CLI_TYPES.CLAUDE_CODE ? 'claude_code_cli' : 'gemini_cli'
        useUsageStore.getState().incrementLLMCallCount(providerKey as 'claude_code_cli' | 'gemini_cli')
        if (result.tokens && result.tokens > 0) useUsageStore.getState().trackTokenUsage(providerKey as 'claude_code_cli' | 'gemini_cli', result.tokens)
        let parsed: Record<string, unknown> = {}
        try { const jsonMatch = result.content.match(/\{[\s\S]*\}/); if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) } catch { parsed = { description: result.content } }
        createForm.setFormData({
          ...createForm.formData, short_description: (parsed.short_description as string) || createForm.formData.short_description,
          description: (parsed.description as string) || createForm.formData.description,
          technologies: Array.isArray(parsed.technologies) && parsed.technologies.length > 0 ? [...new Set([...(createForm.formData.technologies || []), ...(parsed.technologies as string[])])] : createForm.formData.technologies,
        })
        toast({ title: t('aiGenerated') })
      } else {
        const response = await githubApi.generateDescription(user.id, createForm.formData.git_url)
        const data = response.data
        createForm.setFormData({
          ...createForm.formData, short_description: data.short_description || createForm.formData.short_description,
          description: data.description || createForm.formData.description,
          technologies: data.technologies?.length > 0 ? [...new Set([...(createForm.formData.technologies || []), ...data.technologies])] : createForm.formData.technologies,
        })
        toast({ title: t('aiGenerated') })
      }
    } catch (error: any) { toast({ title: t('aiGenerateError'), description: error?.response?.data?.detail || t('aiGenerateFailed'), variant: 'destructive' }) }
    finally { setIsGeneratingAI(false) }
  }

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); createMutation.mutate(createForm.getCleanedData() as ProjectCreate) }
  const handleEditProject = (project: Project) => { setEditingProject(project); editForm.initializeFromProject(project) }
  const handleEditSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!editingProject) return; updateMutation.mutate({ id: editingProject.id, data: editForm.getCleanedData() }) }

  const hasGitUrl = (p: Project) => p.git_url || (p.repositories && p.repositories.length > 0)
  const selectedAnalyzableProjects = projects.filter(p => selection.isSelected(p.id) && hasGitUrl(p) && !p.is_analyzed)
  const pendingProjects = projects.filter((p) => hasGitUrl(p) && !p.is_analyzed && (p.status === 'pending' || !p.status))
  const handleBatchAnalyze = () => { if (pendingProjects.length === 0) { toast({ title: t('noAnalysisTarget'), description: t('noPendingProjects'), variant: 'destructive' }); return }; handleStartBatchAnalysis(pendingProjects) }
  const handleSelectedBatchAnalyze = () => { if (selectedAnalyzableProjects.length === 0) { toast({ title: t('noAnalysisTarget'), description: t('noSelectedAnalyzable'), variant: 'destructive' }); return }; handleStartBatchAnalysis(selectedAnalyzableProjects) }
  const handleSelectedBatchDelete = () => { if (selection.selectedCount === 0) { toast({ title: t('noDeleteTarget'), description: t('noSelectedProjects'), variant: 'destructive' }); return }; setIsBatchDeleteDialogOpen(true) }

  // Kanban
  const kanbanItems: ProjectKanbanItem[] = projects.map((project) => ({ id: project.id, columnId: getColumnId(project), project }))
  const translatedColumns = PROJECT_STATUS_COLUMNS.map(c => ({ id: c.id, title: t(c.titleKey), color: c.color }))
  const columns: KanbanColumn[] = createKanbanColumns(kanbanItems, translatedColumns)
  const handleMove = (itemId: string | number, _fromColumn: string, toColumn: string) => {
    const projectId = typeof itemId === 'string' ? parseInt(itemId) : itemId
    updateStatusMutation.mutate({ id: projectId, status: toColumn })
    const columnName = translatedColumns.find(c => c.id === toColumn)?.title || toColumn
    toast({ title: t('statusChanged'), description: t('statusChangedTo', { column: columnName }) })
  }

  return {
    // Translation
    t,
    tc,

    // User
    user,

    // Analysis store
    isAnalyzing,
    getProgress,
    getJob,
    cancelAnalysis,

    // View and UI state
    viewMode,
    setViewMode,
    batchProgress,
    isDialogOpen,
    setIsDialogOpen,
    isFilterOpen,
    setIsFilterOpen,
    isExportDialogOpen,
    setIsExportDialogOpen,
    searchInput,
    setSearchInput,
    isLoadingRepoInfo,
    isGeneratingAI,

    // Filter state
    filters,
    setFilters,
    activeFilterCount,

    // Selection
    selection,

    // Form hooks
    createForm,
    editForm,
    editingProject,
    setEditingProject,

    // Delete state
    deleteTarget,
    setDeleteTarget,
    isBatchDeleteDialogOpen,
    setIsBatchDeleteDialogOpen,

    // GitHub
    isGitHubConnected,
    githubRepos,

    // Data
    projects,
    companies,
    projectsData,
    isLoading,

    // Mutations
    createMutation,
    deleteMutation,
    updateMutation,
    batchDeleteMutation,

    // Batch analysis
    isBatchAnalyzing,
    selectedAnalyzableProjects,
    pendingProjects,

    // Handlers
    clearFilters,
    handleSearch,
    handleRepoSelected,
    handleEditRepoSelected,
    handleGenerateAI,
    handleSubmit,
    handleEditProject,
    handleEditSubmit,
    handleBatchAnalyze,
    handleSelectedBatchAnalyze,
    handleSelectedBatchDelete,

    // Kanban
    kanbanItems,
    columns,
    handleMove,

  }
}
