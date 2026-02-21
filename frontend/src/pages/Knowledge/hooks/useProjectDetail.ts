import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { projectsApi, companiesApi, type ProjectCreate } from '@/api/knowledge'
import { useProjectForm } from '@/hooks/useProjectForm'
import { githubApi, GitHubRepo } from '@/api/github'
import { reportsApi, type DetailedReportData, type FinalReportData } from '@/api/documents'

export function useProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation('projects')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const { isElectronApp, aiMode, selectedCLI, selectedLLMProvider, claudeCodeModel, geminiCLIModel } = useAppStore()

  // Analysis store for background analysis tracking
  const {
    isAnalyzing,
    getProgress,
    getJob,
    startPolling,
    startAnalysis,
    cancelAnalysis,
    activeJobs,
  } = useAnalysisStore()

  const { i18n } = useTranslation()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const editForm = useProjectForm()
  // Initialize analysis language — will be overridden by project data if available
  const [analysisLanguage, setAnalysisLanguage] = useState<'ko' | 'en'>(
    i18n.language?.startsWith('ko') ? 'ko' : i18n.language?.startsWith('en') ? 'en' : 'ko'
  )
  const [languageInitialized, setLanguageInitialized] = useState(false)

  const projectId = parseInt(id || '0')

  // Track which job task_ids have already shown a notification (prevents repeated toasts)
  const notifiedTaskIds = useRef(new Set<string>())

  // Ensure polling is running (App.tsx manages lifecycle, this just ensures it's started)
  useEffect(() => {
    if (user?.id) {
      startPolling(user.id)
    }
  }, [user?.id, startPolling])

  // Refetch data when analysis completes
  useEffect(() => {
    const job = activeJobs.get(projectId)
    if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['repo-analysis-effective', projectId] })
      queryClient.invalidateQueries({ queryKey: ['contributor-analysis', projectId] })
      queryClient.invalidateQueries({ queryKey: ['per-repo-analysis', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })

      // Only show notification once per task_id
      if (!notifiedTaskIds.current.has(job.task_id)) {
        notifiedTaskIds.current.add(job.task_id)

        if (job.status === 'completed') {
          toast({ title: t('backgroundAnalysis.completed'), description: t('backgroundAnalysis.completedDesc') })
        } else if (job.status === 'failed') {
          toast({ title: t('backgroundAnalysis.failed'), description: t('backgroundAnalysis.failedDesc', { error: job.error_message }), variant: 'destructive' })
        } else if (job.status === 'cancelled') {
          toast({ title: t('backgroundAnalysis.cancelled') })
        }
      }
    }
  }, [activeJobs, projectId, queryClient, toast, t])

  const analyzing = isAnalyzing(projectId)
  const analysisProgress = getProgress(projectId)
  const analysisJob = getJob(projectId)

  // Fetch companies for edit form
  const { data: companiesData } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: () => companiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const companies = companiesData?.data || []

  // GitHub connection check
  const isGitHubConnected = !!user?.github_username

  // Fetch GitHub repos for edit dialog repo selector
  const { data: reposData } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id && isGitHubConnected && isEditDialogOpen,
  })
  const githubRepos: GitHubRepo[] = (reposData?.data?.repos || []).slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', projectId, user?.id],
    queryFn: () => projectsApi.getById(user!.id, projectId),
    enabled: !!projectId && !!user?.id,
  })

  // Set analysis language from project's last analysis language, or fallback to user preference
  useEffect(() => {
    if (!languageInitialized && projectData?.data?.analysis_language) {
      setAnalysisLanguage(projectData.data.analysis_language as 'ko' | 'en')
      setLanguageInitialized(true)
    } else if (!languageInitialized && user?.preferred_language) {
      setAnalysisLanguage(user.preferred_language as 'ko' | 'en')
    }
  }, [projectData?.data?.analysis_language, user?.preferred_language, languageInitialized])

  // Use effective analysis (with user edits applied)
  const { data: analysisData } = useQuery({
    queryKey: ['repo-analysis-effective', projectId],
    queryFn: () => githubApi.getEffectiveAnalysis(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  // Fetch contributor analysis for the current user
  const { data: contributorAnalysisData } = useQuery({
    queryKey: ['contributor-analysis', projectId, user?.id],
    queryFn: () => githubApi.getContributorAnalysis(projectId, user!.id),
    enabled: !!projectId && !!projectData?.data?.is_analyzed && !!user?.id,
  })

  // Fetch per-repo analyses for multi-repo projects
  const hasMultipleRepos = (projectData?.data?.repositories?.length ?? 0) > 1
  const { data: perRepoData } = useQuery({
    queryKey: ['per-repo-analysis', projectId],
    queryFn: () => githubApi.getPerRepoAnalyses(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed && hasMultipleRepos,
  })

  // Mutation for updating analysis content
  const updateContentMutation = useMutation({
    mutationFn: ({ field, content }: { field: 'key_tasks' | 'implementation_details' | 'detailed_achievements', content: any }) =>
      githubApi.updateAnalysisContent(projectId, { field, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-analysis-effective', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })
      toast({ title: t('detail.toast.saveSuccess'), description: t('detail.toast.saveSuccessDesc') })
    },
    onError: (error: any) => {
      toast({
        title: t('detail.toast.saveFailed'),
        description: error?.response?.data?.detail || t('detail.toast.saveFailedDesc'),
        variant: 'destructive'
      })
    },
  })

  // Mutation for resetting analysis field
  const resetFieldMutation = useMutation({
    mutationFn: (field: string) => githubApi.resetAnalysisField(projectId, field),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-analysis-effective', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })
      toast({ title: t('detail.toast.resetSuccess'), description: t('detail.toast.resetSuccessDesc') })
    },
    onError: (error: any) => {
      toast({
        title: t('detail.toast.resetFailed'),
        description: error?.response?.data?.detail || t('detail.toast.resetFailedDesc'),
        variant: 'destructive'
      })
    },
  })

  // Fetch report data for tabs
  const { data: finalReport } = useQuery({
    queryKey: ['report-final', projectId],
    queryFn: () => reportsApi.getFinalReport(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  const { data: detailedReport } = useQuery({
    queryKey: ['report-detailed', projectId],
    queryFn: () => reportsApi.getDetailedReport(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  // Start background analysis
  const handleStartAnalysis = async () => {
    if (!user?.id) return
    // Get git URL from project or primary repository
    const gitUrl = project?.git_url || project?.repositories?.find((r) => r.is_primary)?.git_url || project?.repositories?.[0]?.git_url
    if (!gitUrl) return

    // Build options based on aiMode
    const options: Parameters<typeof startAnalysis>[3] = {
      language: analysisLanguage,  // Pass selected analysis language
    }

    if (aiMode === 'cli' && isElectronApp) {
      // CLI mode (Electron only)
      options.cli_mode = selectedCLI
      options.cli_model = selectedCLI === 'claude_code' ? claudeCodeModel : geminiCLIModel
    } else {
      // API mode
      options.provider = selectedLLMProvider
    }

    try {
      await startAnalysis(user.id, gitUrl, project!.id, options)
      toast({ title: t('detail.toast.analyzeStarted'), description: t('detail.toast.analyzeStartedDesc') })
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || t('detail.toast.analyzeFailedDesc')
      toast({
        title: t('detail.toast.analyzeFailed'),
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  // Cancel ongoing analysis
  const handleCancelAnalysis = async () => {
    if (!user?.id) return
    try {
      await cancelAnalysis(user.id, projectId)
      toast({ title: t('backgroundAnalysis.cancelled') })
    } catch (error: any) {
      toast({
        title: t('detail.toast.cancelFailed'),
        description: error?.response?.data?.detail || 'Failed to cancel analysis',
        variant: 'destructive'
      })
    }
  }

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ProjectCreate>) => projectsApi.update(user!.id, projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsEditDialogOpen(false)
      toast({ title: t('detail.toast.updateSuccess') })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || t('detail.toast.updateFailedDesc')
      toast({ title: t('detail.toast.updateFailed'), description: errorMessage, variant: 'destructive' })
    },
  })

  // Open edit dialog with current project data
  const openEditDialog = () => {
    if (!project) return
    editForm.initializeFromProject(project)
    setIsEditDialogOpen(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(editForm.getCleanedData())
  }

  const handleEditRepoSelected = async (repoUrl: string) => {
    if (!repoUrl || !user?.id) return
    editForm.setFormData((prev) => ({ ...prev, git_url: repoUrl }))
    try {
      const [infoResponse, techResponse] = await Promise.all([
        githubApi.getRepoInfo(user.id, repoUrl),
        githubApi.detectTechnologies(user.id, repoUrl),
      ])
      const info = infoResponse.data
      const technologies = techResponse.data.technologies || []
      editForm.setFormData((prev) => ({
        ...prev,
        short_description: info.description || prev.short_description,
        git_url: info.html_url || repoUrl,
        start_date: info.start_date || prev.start_date,
        end_date: info.end_date || '',
        team_size: info.team_size || prev.team_size,
        contribution_percent: info.contribution_percent || prev.contribution_percent,
        technologies: technologies.length > 0 ? technologies : prev.technologies,
      }))
      editForm.setIsOngoing(!info.end_date)
      toast({ title: t('repoInfoLoaded') })
    } catch (error: any) {
      toast({ title: t('detail.toast.updateFailed'), description: error?.response?.data?.detail || 'Failed to load repo info', variant: 'destructive' })
    }
  }

  const project = projectData?.data
  const analysis = analysisData?.data
  const final = finalReport?.data as FinalReportData | undefined
  const detailed = detailedReport?.data as DetailedReportData | undefined

  return {
    // Navigation
    navigate,
    // Translation
    t,
    // Core data
    projectId,
    project,
    analysis,
    final,
    detailed,
    isLoading,
    companies,
    // Analysis state
    analyzing,
    analysisProgress,
    analysisJob,
    analysisLanguage,
    setAnalysisLanguage,
    // Analysis handlers
    handleStartAnalysis,
    handleCancelAnalysis,
    // Content mutations
    updateContentMutation,
    resetFieldMutation,
    // Edit dialog
    isEditDialogOpen,
    setIsEditDialogOpen,
    editForm,
    openEditDialog,
    handleEditSubmit,
    handleEditRepoSelected,
    updateMutation,
    isGitHubConnected,
    githubRepos,
    // Export dialog
    isExportDialogOpen,
    setIsExportDialogOpen,
    // Contributor / per-repo data
    contributorAnalysisData,
    perRepoData,
  }
}
