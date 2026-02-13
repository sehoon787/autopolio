import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { Progress } from '@/components/ui/progress'
import { SelectableTile } from '@/components/ui/selectable-tile'
import { SelectionActionBar } from '@/components/ui/selection-action-bar'
import { useSelection } from '@/hooks/useSelection'
import { useProjectForm } from '@/hooks/useProjectForm'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { useUsageStore } from '@/stores/usageStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { generateWithCLI } from '@/services/cliLLMService'
import { isElectron } from '@/lib/electron'
import { projectsApi, companiesApi, ProjectCreate, ProjectFilters as ProjectFiltersType, Project } from '@/api/knowledge'
import { githubApi, GitHubRepo } from '@/api/github'
import {
  KanbanBoard,
  KanbanItem,
  KanbanColumn,
  PROJECT_STATUS_COLUMNS,
  createKanbanColumns,
} from '@/components/KanbanBoard'
import { formatDate } from '@/lib/utils'
import { ScrollToTop } from '@/components/ScrollToTop'
import { ExportDialog } from '@/components/ExportDialog'
import { ProjectFormFields } from '@/components/ProjectFormFields'
import { ProjectFilters, countActiveFilters } from '@/components/ProjectFilters'
import { Plus, Pencil, Trash2, FolderKanban, Github, ExternalLink, Loader2, Sparkles, Kanban, List, Filter, X, Search, Play, RefreshCw, Calendar, Users, Briefcase, FileDown, StopCircle } from 'lucide-react'

// Kanban item interface
interface ProjectKanbanItem extends KanbanItem {
  project: Project
}

// Map project status to kanban column ID
function getColumnId(project: Project): string {
  if (project.is_analyzed) return 'completed'
  if (project.status) {
    const validStatuses = PROJECT_STATUS_COLUMNS.map(c => c.id)
    if (validStatuses.includes(project.status)) return project.status
  }
  return 'pending'
}

// Kanban card component
function ProjectKanbanCard({ project }: { project: Project }) {
  const { t } = useTranslation('projects')
  const { isAnalyzing, getProgress } = useAnalysisStore()
  const analyzing = isAnalyzing(project.id)
  const progress = getProgress(project.id)

  return (
    <Card className="hover:shadow-md transition-shadow bg-white">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/knowledge/projects/${project.id}`} className="font-medium text-sm hover:text-primary hover:underline line-clamp-2">
            {project.name}
          </Link>
          <div className="flex items-center gap-1">
            {analyzing && (
              <Badge className="bg-blue-500 text-white animate-pulse text-xs shrink-0">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                {progress}%
              </Badge>
            )}
            {project.project_type && !analyzing && (
              <Badge variant="outline" className="text-xs shrink-0">
                {project.project_type === 'company' ? t('projectTypes.company') :
                 project.project_type === 'personal' ? t('projectTypes.personal') :
                 project.project_type === 'open-source' ? t('projectTypes.openSource') : project.project_type}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {project.short_description && <p className="text-xs text-gray-600 line-clamp-2">{project.short_description}</p>}
        <div className="flex flex-wrap gap-1">
          {project.technologies?.slice(0, 4).map((tech) => <TechBadge key={tech.id} tech={tech.name} size="sm" />)}
          {project.technologies?.length > 4 && <Badge variant="secondary" className="text-xs py-0">+{project.technologies.length - 4}</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
          {project.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(project.start_date)}</span>}
          {project.team_size && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t('teamSizeValue', { count: project.team_size })}</span>}
          {project.role && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{project.role}</span>}
        </div>
        {project.git_url && (
          <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline pt-1" onClick={(e) => e.stopPropagation()}>
            <Github className="h-3 w-3" />GitHub<ExternalLink className="h-2 w-2" />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

export default function ProjectsPage() {
  const { t } = useTranslation('projects')
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
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('')
  const [isLoadingRepoInfo, setIsLoadingRepoInfo] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<ProjectFiltersType>({ sort_by: 'is_analyzed,created_at', sort_order: 'asc,desc' })
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
  const githubRepos: GitHubRepo[] = (reposData?.data?.repos || []).slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['projects'] })
      setIsDialogOpen(false)
      createForm.reset()
      setSelectedRepoUrl('')
      toast({ title: t('projectAdded') })
    },
    onError: (error: any) => toast({ title: tc('error'), description: error?.response?.data?.detail || t('addFailed'), variant: 'destructive' }),
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

  // Start individual analyses for each project (to show individual "분석중" status)
  const handleStartBatchAnalysis = async (projectsToAnalyze: Project[]) => {
    if (!user?.id || projectsToAnalyze.length === 0) return

    const { aiMode, selectedCLI, claudeCodeModel, geminiCLIModel, selectedLLMProvider } = useAppStore.getState()
    const useCli = aiMode === 'cli' && isElectron()

    setIsBatchAnalyzing(true)
    setBatchProgress({ current: 0, total: projectsToAnalyze.length })

    let completed = 0
    let failed = 0

    for (const project of projectsToAnalyze) {
      if (!project.git_url) {
        failed++
        continue
      }

      try {
        const options: Parameters<typeof startAnalysis>[3] = {}
        if (useCli) {
          options.cli_mode = selectedCLI as 'claude_code' | 'gemini_cli'
          options.cli_model = selectedCLI === 'claude_code' ? claudeCodeModel : geminiCLIModel
        } else if (selectedLLMProvider) {
          options.provider = selectedLLMProvider
        }

        await startAnalysis(user.id, project.git_url, project.id, options)
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
  const clearFilters = () => { setFilters({ sort_by: 'is_analyzed,created_at', sort_order: 'asc,desc' }); setSearchInput(''); selection.deselectAll() }
  const handleSearch = () => setFilters(prev => ({ ...prev, search: searchInput || undefined }))

  const handleRepoSelect = async (repoUrl: string) => {
    if (!repoUrl || repoUrl === 'manual') { setSelectedRepoUrl(''); return }
    setSelectedRepoUrl(repoUrl)
    createForm.setFormData({ ...createForm.formData, git_url: repoUrl })
    if (!user?.id) return
    setIsLoadingRepoInfo(true)
    try {
      const [infoResponse, techResponse] = await Promise.all([githubApi.getRepoInfo(user.id, repoUrl), githubApi.detectTechnologies(user.id, repoUrl)])
      const info = infoResponse.data
      const technologies = techResponse.data.technologies || []
      createForm.setFormData({
        ...createForm.formData, short_description: info.description || createForm.formData.short_description, git_url: info.html_url || repoUrl,
        start_date: info.start_date || createForm.formData.start_date, end_date: info.end_date || '',
        team_size: info.team_size || createForm.formData.team_size, contribution_percent: info.contribution_percent || createForm.formData.contribution_percent,
        project_type: 'personal', technologies: technologies.length > 0 ? technologies : createForm.formData.technologies,
      })
      createForm.setIsOngoing(!info.end_date)
      toast({ title: t('repoInfoLoaded') })
    } catch (error: any) { toast({ title: tc('error'), description: error?.response?.data?.detail || t('repoInfoFailed'), variant: 'destructive' }) }
    finally { setIsLoadingRepoInfo(false) }
  }

  const handleGenerateAI = async () => {
    if (!user?.id || !createForm.formData.git_url) { toast({ title: t('gitUrlRequired'), variant: 'destructive' }); return }
    const { aiMode, selectedCLI } = useAppStore.getState()
    const useCli = aiMode === 'cli' && isElectron()
    setIsGeneratingAI(true)
    try {
      if (useCli) {
        const cli = selectedCLI as 'claude_code' | 'gemini_cli'
        const prompt = `Analyze this GitHub repository and generate a project description for a resume/portfolio.\nRepository URL: ${createForm.formData.git_url}\nProject name: ${createForm.formData.name || 'Unknown'}\n\nReturn JSON with: { "short_description": "...", "description": "...", "technologies": ["..."] }`
        const result = await generateWithCLI(prompt, cli)
        if (!result.success) { toast({ title: t('aiGenerateError'), description: `CLI failed: ${result.error}. Try switching to API mode.`, variant: 'destructive' }); return }
        const providerKey = cli === 'claude_code' ? 'claude_code_cli' : 'gemini_cli'
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

  const selectedAnalyzableProjects = projects.filter(p => selection.isSelected(p.id) && p.git_url && !p.is_analyzed)
  const pendingProjects = projects.filter((p) => p.git_url && !p.is_analyzed && (p.status === 'pending' || !p.status))
  const handleBatchAnalyze = () => { if (pendingProjects.length === 0) { toast({ title: t('noAnalysisTarget'), description: t('noPendingProjects'), variant: 'destructive' }); return }; handleStartBatchAnalysis(pendingProjects) }
  const handleSelectedBatchAnalyze = () => { if (selectedAnalyzableProjects.length === 0) { toast({ title: t('noAnalysisTarget'), description: t('noSelectedAnalyzable'), variant: 'destructive' }); return }; handleStartBatchAnalysis(selectedAnalyzableProjects) }
  const handleSelectedBatchDelete = () => { if (selection.selectedCount === 0) { toast({ title: t('noDeleteTarget'), description: t('noSelectedProjects'), variant: 'destructive' }); return }; setIsBatchDeleteDialogOpen(true) }

  // Kanban
  const kanbanItems: ProjectKanbanItem[] = projects.map((project) => ({ id: project.id, columnId: getColumnId(project), project }))
  const columns: KanbanColumn[] = createKanbanColumns(kanbanItems, PROJECT_STATUS_COLUMNS)
  const handleMove = (itemId: string | number, _fromColumn: string, toColumn: string) => {
    const projectId = typeof itemId === 'string' ? parseInt(itemId) : itemId
    updateStatusMutation.mutate({ id: projectId, status: toColumn })
    const columnName = PROJECT_STATUS_COLUMNS.find(c => c.id === toColumn)?.title || toColumn
    toast({ title: t('statusChanged'), description: t('statusChangedTo', { column: columnName }) })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'kanban' && pendingProjects.length > 0 && (
            <Button onClick={handleBatchAnalyze} disabled={isBatchAnalyzing} variant="outline">
              {isBatchAnalyzing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {isBatchAnalyzing ? t('analyzing', { current: batchProgress?.current || 0, total: batchProgress?.total || 0 }) : t('batchAnalysis', { count: pendingProjects.length })}
            </Button>
          )}
          <Link to="/github/repos"><Button variant="outline"><Github className="h-4 w-4 mr-2" />{t('importRepos')}</Button></Link>
          <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}><FileDown className="h-4 w-4 mr-2" />{t('exportProjects')}</Button>
          <div className="flex items-center border rounded-lg">
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" className="rounded-r-none" onClick={() => setViewMode('list')}><List className="h-4 w-4 mr-1" />{t('listView')}</Button>
            <Button variant={viewMode === 'kanban' ? 'default' : 'ghost'} size="sm" className="rounded-l-none" onClick={() => setViewMode('kanban')}><Kanban className="h-4 w-4 mr-1" />{t('kanbanView')}</Button>
          </div>
          <Button onClick={() => { createForm.reset(); setSelectedRepoUrl(''); setIsDialogOpen(true) }}><Plus className="h-4 w-4 mr-2" />{t('addProject')}</Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder={t('searchPlaceholder')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="pl-10" />
          </div>
          <Button variant="outline" onClick={handleSearch}>{tc('search')}</Button>
        </div>
        <Button variant={isFilterOpen ? 'secondary' : 'outline'} onClick={() => setIsFilterOpen(!isFilterOpen)}>
          <Filter className="h-4 w-4 mr-2" />{t('filter')}{activeFilterCount > 0 && <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-xs">{activeFilterCount}</Badge>}
        </Button>
        {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1" />{t('clearFilters')}</Button>}
      </div>

      {/* Filter Panel */}
      <ProjectFilters isOpen={isFilterOpen} onOpenChange={setIsFilterOpen} filters={filters} onFiltersChange={setFilters} companies={companies} />

      {/* Results count */}
      {projectsData?.data && <div className="text-sm text-gray-500">{t('projectCount', { count: projectsData.data.total })}{activeFilterCount > 0 && ` (${t('filterApplied')})`}</div>}

      {/* Batch analysis progress */}
      {batchProgress && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('batchAnalysisInProgress')}</span>
                  <span className="text-sm text-gray-500">{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-8">{tc('loading')}</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noProjects')}</h3>
            <p className="text-gray-500 mb-4">{t('noProjectsDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('addFirstProject')}</Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          <SelectionActionBar totalCount={projects.length} selectedCount={selection.selectedCount} onSelectAllChange={(selectAll) => selectAll ? selection.selectAll(projects.map(p => p.id)) : selection.deselectAll()} selectAllLabel={t('selectAll')} selectedCountLabel={`(${selection.selectedCount} ${tc('selected')})`}>
            <Button onClick={handleSelectedBatchAnalyze} disabled={isBatchAnalyzing || selectedAnalyzableProjects.length === 0} size="sm">
              {isBatchAnalyzing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}{t('analyze')} ({selectedAnalyzableProjects.length})
            </Button>
            <Button onClick={handleSelectedBatchDelete} disabled={batchDeleteMutation.isPending} size="sm" variant="destructive">
              {batchDeleteMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}{tc('delete')} ({selection.selectedCount})
            </Button>
          </SelectionActionBar>
          <div className="grid gap-4">
            {projects.map((project) => {
              const analyzing = isAnalyzing(project.id)
              const progress = getProgress(project.id)
              const job = getJob(project.id)

              return (
                <SelectableTile key={project.id} id={project.id} selected={selection.isSelected(project.id)} onSelectChange={() => selection.toggle(project.id)} className="hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link to={`/knowledge/projects/${project.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold">{project.name}</h3></Link>
                          {analyzing ? (
                            <Badge className="bg-blue-500 text-white animate-pulse">
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              {t('backgroundAnalysis.inProgress')} ({progress}%)
                            </Badge>
                          ) : project.is_analyzed ? (
                            <Badge variant="success">{t('analyzed')}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">{t('notAnalyzed')}</Badge>
                          )}
                          {project.project_type && <Badge variant="outline">{project.project_type}</Badge>}
                        </div>
                        {analyzing && job && (
                          <div className="mb-2 flex items-center gap-2">
                            <Progress value={progress} className="h-2 flex-1 max-w-xs" />
                            <span className="text-xs text-gray-500">{t('backgroundAnalysis.stepProgress', { step: job.current_step, total: job.total_steps })}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (user?.id) cancelAnalysis(user.id, project.id)
                              }}
                            >
                              <StopCircle className="h-3 w-3 mr-1" />
                              {t('backgroundAnalysis.cancel')}
                            </Button>
                          </div>
                        )}
                        {project.short_description && <p className="text-gray-700">{project.short_description}</p>}
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                          {project.start_date && <span>{formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : t('ongoing')}</span>}
                          {project.role && <span>· {project.role}</span>}
                          {project.team_size && <span>· {t('teamSizeValue', { count: project.team_size })}</span>}
                        </div>
                        {project.technologies?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {project.technologies.slice(0, 10).map((tech) => <TechBadge key={tech.id} tech={tech.name} />)}
                            {project.technologies.length > 10 && <Badge variant="outline" className="text-xs">{t('detail.basicInfo.moreCount', { count: project.technologies.length - 10 })}</Badge>}
                          </div>
                        )}
                        {project.git_url && (
                          <div className="mt-3">
                            <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 text-sm text-primary rounded-md hover:bg-primary/5 hover:underline transition-colors" onClick={(e) => e.stopPropagation()}>
                              <Github className="h-4 w-4" /><span>GitHub</span><ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => handleEditProject(project)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: project.id, name: project.name })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </SelectableTile>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto pb-4">
            <KanbanBoard<ProjectKanbanItem> columns={columns} onMove={handleMove} onReorder={() => {}} renderItem={(item) => <ProjectKanbanCard project={item.project} />} renderOverlay={(item) => <ProjectKanbanCard project={item.project} />} renderEmptyState={() => <span>{t('dragProjectHere')}</span>} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {PROJECT_STATUS_COLUMNS.map((col) => {
              const count = columns.find(c => c.id === col.id)?.items.length || 0
              return <Card key={col.id}><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{count}</div><div className="text-sm text-gray-500">{col.title}</div></CardContent></Card>
            })}
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('dialog.title')}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isGitHubConnected && githubRepos.length > 0 && (
              <div className="space-y-2">
                <Label>{t('dialog.importFromGithub')}</Label>
                <Select value={selectedRepoUrl} onValueChange={handleRepoSelect}>
                  <SelectTrigger><SelectValue placeholder={t('dialog.selectRepo')}>{isLoadingRepoInfo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t('dialog.manualInput')}</SelectItem>
                    {githubRepos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.html_url}>
                        <div className="flex items-center gap-2"><Github className="h-4 w-4" /><span>{repo.full_name}</span>{repo.language && <Badge variant="outline" className="text-xs">{repo.language}</Badge>}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">{t('dialog.repoSelectionHint')}</p>
              </div>
            )}
            {isLoadingRepoInfo && <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="ml-2 text-sm text-gray-500">{t('dialog.loadingRepoInfo')}</span></div>}
            <ProjectFormFields formData={createForm.formData} onChange={createForm.setFormData} companies={companies} techInput={createForm.techInput} onTechInputChange={createForm.setTechInput} onAddTechnology={createForm.addTechnology} onRemoveTechnology={createForm.removeTechnology} isOngoing={createForm.isOngoing} onOngoingChange={createForm.setIsOngoing} />
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleGenerateAI} disabled={!createForm.formData.git_url || isGeneratingAI} className="ml-auto">
                  {isGeneratingAI ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}{t('dialog.generateAI')}
                </Button>
              </div>
              <p className="text-xs text-gray-500">{t('dialog.aiGenerateHint')}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{tc('cancel')}</Button>
              <Button type="submit" disabled={createMutation.isPending}>{tc('add')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('editDialog.title')}</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <ProjectFormFields formData={editForm.formData} onChange={editForm.setFormData} companies={companies} techInput={editForm.techInput} onTechInputChange={editForm.setTechInput} onAddTechnology={editForm.addTechnology} onRemoveTechnology={editForm.removeTechnology} isOngoing={editForm.isOngoing} onOngoingChange={editForm.setIsOngoing} idPrefix="edit_" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProject(null)}>{tc('cancel')}</Button>
              <Link to={`/knowledge/projects/${editingProject?.id}`}><Button type="button" variant="secondary">{t('editDialog.viewDetail')}</Button></Link>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{tc('save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ExportDialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen} />
      <ScrollToTop />

      {/* Delete Dialogs */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle><AlertDialogDescription>{t('deleteDialog.singleDescription', { name: deleteTarget?.name })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null) } }} className="bg-red-600 hover:bg-red-700">{t('deleteDialog.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBatchDeleteDialogOpen} onOpenChange={setIsBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle><AlertDialogDescription>{t('deleteDialog.batchDescription', { count: selection.selectedCount })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { batchDeleteMutation.mutate(selection.getSelectedArray()); setIsBatchDeleteDialogOpen(false) }} className="bg-red-600 hover:bg-red-700">{t('deleteDialog.confirmBatch', { count: selection.selectedCount })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
