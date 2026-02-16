import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { projectsApi, companiesApi, type ProjectCreate } from '@/api/knowledge'
import { useProjectForm } from '@/hooks/useProjectForm'
import { ProjectFormFields } from '@/components/ProjectFormFields'
import { githubApi, GitHubRepo } from '@/api/github'
import { reportsApi, type DetailedReportData, type FinalReportData } from '@/api/documents'
import { ScrollToTop } from '@/components/ScrollToTop'
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  FileDown,
  BarChart3,
  ClipboardList,
  Pencil,
  HelpCircle,
  X,
  StopCircle,
  Github,
  ExternalLink,
  Star,
  Bot,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from '@/components/ui/popover'
import { ExportDialog } from '@/components/ExportDialog'
import { formatDateTime } from '@/lib/utils'
import { BasicInfoTab, SummaryTab, DetailTab } from './ProjectDetailTabs'

export default function ProjectDetailPage() {
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

  if (isLoading) {
    return <div className="text-center py-8">{t('detail.loading')}</div>
  }

  if (!project) {
    return <div className="text-center py-8">{t('detail.notFound')}</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.short_description && (
              <p className="text-gray-600 mt-1">{project.short_description}</p>
            )}
            {/* Repository links */}
            {project.repositories && project.repositories.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Github className="h-4 w-4 text-gray-500" />
                {project.repositories.map((repo) => (
                  <a
                    key={repo.id || repo.git_url}
                    href={repo.git_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-sm text-primary rounded-md border border-gray-200 hover:bg-primary/5 hover:underline transition-colors"
                  >
                    {repo.label || repo.git_url.split('/').pop()}
                    {repo.is_primary && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
            {/* Progress bar during analysis */}
            {analyzing && analysisJob && (
              <div className="mt-2 flex items-center gap-2">
                <Progress value={analysisProgress} className="h-2 flex-1 max-w-md" />
                <span className="text-xs text-gray-500">
                  {analysisProgress}%
                </span>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={openEditDialog}>
            <Pencil className="h-4 w-4 mr-2" />
            {t('detail.buttons.edit')}
          </Button>
          {project.is_analyzed && (
            <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>
              <FileDown className="h-4 w-4 mr-2" />
              {t('detail.buttons.export')}
            </Button>
          )}
          {(project.git_url || (project.repositories && project.repositories.length > 0)) && (
            <div className="flex items-center gap-2">
              {/* Analysis Language Selector */}
              {!analyzing && (
                <div className="flex items-center gap-1">
                  <Select
                    value={analysisLanguage}
                    onValueChange={(v) => setAnalysisLanguage(v as 'ko' | 'en')}
                  >
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ko">{t('detail.analysisLanguage.korean')}</SelectItem>
                      <SelectItem value="en">{t('detail.analysisLanguage.english')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" className="max-w-xs">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm font-medium">{t('detail.analysisLanguage.helpTitle')}</p>
                        <PopoverClose asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </PopoverClose>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{t('detail.analysisLanguage.helpDescription')}</p>
                      <ul className="text-xs space-y-1 text-muted-foreground">
                        <li>• {t('detail.analysisLanguage.helpPoint1')}</li>
                        <li>• {t('detail.analysisLanguage.helpPoint2')}</li>
                        <li>• {t('detail.analysisLanguage.helpPoint3')}</li>
                      </ul>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {analyzing ? (
                <Button
                  variant="destructive"
                  onClick={handleCancelAnalysis}
                >
                  <StopCircle className="h-4 w-4 mr-2" />
                  {t('backgroundAnalysis.cancel')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleStartAnalysis}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {project.is_analyzed ? t('detail.buttons.reanalyze') : t('detail.buttons.analyzeRepo')}
                </Button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" className="max-w-xs">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-medium">{t('detail.analyzeHelp.description')}</p>
                    <PopoverClose asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-2">
                        <X className="h-3 w-3" />
                      </Button>
                    </PopoverClose>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• {t('detail.analyzeHelp.point1')}</li>
                    <li>• {t('detail.analyzeHelp.point2')}</li>
                    <li>• {t('detail.analyzeHelp.point3')}</li>
                  </ul>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* Status badges row — below action buttons */}
        <div className="flex items-center gap-3 pl-14">
          {analyzing ? (
            <Badge className="bg-blue-500 text-white animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              {t('backgroundAnalysis.inProgress')} ({analysisProgress}%)
            </Badge>
          ) : project.is_analyzed ? (
            <>
              <Badge variant="success">{t('detail.badge.analyzed')}</Badge>
              {project.last_analyzed_at && (
                <span className="text-sm text-gray-400">{t('analyzedAt', { date: formatDateTime(project.last_analyzed_at) })}</span>
              )}
            </>
          ) : null}
          {/* AI Tools (Vibe Coding) badges */}
          {project.ai_tools_detected && project.ai_tools_detected.length > 0 && (
            <>
              <Badge className="bg-violet-500 text-white">
                <Bot className="h-3 w-3 mr-1" />
                {t('detail.badge.vibeCoding')}
              </Badge>
              {project.ai_tools_detected.map((tool) => (
                <Badge key={tool.tool} variant="outline" className="text-violet-600 border-violet-300">
                  {tool.tool} ({t('detail.badge.aiToolCommits', { count: tool.count })})
                </Badge>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 3-Tab Structure */}
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {t('detail.tabs.basic')}
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('detail.tabs.summary')}
          </TabsTrigger>
          <TabsTrigger value="detail" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('detail.tabs.detail')}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 기본정보 (PROJECT_PERFORMANCE_SUMMARY style) */}
        <TabsContent value="basic" className="mt-6 space-y-6">
          <BasicInfoTab
            project={project}
            analysis={analysis}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveKeyTasks={async (items) => {
              await updateContentMutation.mutateAsync({ field: 'key_tasks', content: items })
            }}
            onResetKeyTasks={async () => {
              await resetFieldMutation.mutateAsync('key_tasks')
            }}
            contributorAnalysis={contributorAnalysisData?.data}
            companies={companies}
            perRepoAnalyses={perRepoData?.data}
          />
        </TabsContent>

        {/* Tab 2: 분석 요약 (FINAL_PROJECT_REPORT style) */}
        <TabsContent value="summary" className="mt-6 space-y-6">
          <SummaryTab
            project={project}
            analysis={analysis}
            final={final}
            detailed={detailed}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveKeyTasks={async (items) => {
              await updateContentMutation.mutateAsync({ field: 'key_tasks', content: items })
            }}
            onResetKeyTasks={async () => {
              await resetFieldMutation.mutateAsync('key_tasks')
            }}
            contributorAnalysis={contributorAnalysisData?.data}
            perRepoAnalyses={perRepoData?.data}
          />
        </TabsContent>

        {/* Tab 3: 상세 분석 (DETAILED_COMPLETION_REPORT style) */}
        <TabsContent value="detail" className="mt-6 space-y-6">
          <DetailTab
            project={project}
            analysis={analysis}
            detailed={detailed}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveImplementationDetails={async (sections) => {
              await updateContentMutation.mutateAsync({ field: 'implementation_details', content: sections })
            }}
            onResetImplementationDetails={async () => {
              await resetFieldMutation.mutateAsync('implementation_details')
            }}
            contributorAnalysis={contributorAnalysisData?.data}
            perRepoAnalyses={perRepoData?.data}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('detail.editDialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <ProjectFormFields
              formData={editForm.formData}
              onChange={editForm.setFormData}
              companies={companies}
              techInput={editForm.techInput}
              onTechInputChange={editForm.setTechInput}
              onAddTechnology={editForm.addTechnology}
              onRemoveTechnology={editForm.removeTechnology}
              isOngoing={editForm.isOngoing}
              onOngoingChange={editForm.setIsOngoing}
              onAddRepository={editForm.addRepository}
              onRemoveRepository={editForm.removeRepository}
              onUpdateRepository={editForm.updateRepository}
              onSetPrimaryRepository={editForm.setPrimaryRepository}
              githubRepos={isGitHubConnected ? githubRepos : undefined}
              onRepoSelected={handleEditRepoSelected}
              idPrefix="detail_edit_"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                {t('detail.buttons.cancel')}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t('detail.buttons.saving') : t('detail.buttons.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        projectId={projectId}
        projectName={project.name}
      />

      <ScrollToTop />
    </div>
  )
}
