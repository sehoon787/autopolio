import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { Progress } from '@/components/ui/progress'
import { SelectableTile } from '@/components/ui/selectable-tile'
import { SelectionActionBar } from '@/components/ui/selection-action-bar'
import { useSelection } from '@/hooks/useSelection'
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
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { useUsageStore } from '@/stores/usageStore'
import { generateWithCLI } from '@/services/cliLLMService'
import { isElectron } from '@/lib/electron'
import { projectsApi, companiesApi, ProjectCreate, ProjectFilters, Project } from '@/api/knowledge'
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
import { Plus, Pencil, Trash2, FolderKanban, Github, ExternalLink, Loader2, Sparkles, Kanban, List, Filter, X, Search, Play, RefreshCw, Calendar, Users, Briefcase, FileDown } from 'lucide-react'

// Extend Project to be a KanbanItem
interface ProjectKanbanItem extends KanbanItem {
  project: Project
}

// Map project status to kanban column IDs
function getColumnId(project: Project): string {
  // is_analyzed가 true이면 completed로 표시 (status보다 우선)
  // 이렇게 해야 리스트 뷰의 "분석됨" 배지와 칸반 뷰의 컬럼이 일치함
  if (project.is_analyzed) {
    return 'completed'
  }
  if (project.status) {
    const validStatuses = PROJECT_STATUS_COLUMNS.map(c => c.id)
    if (validStatuses.includes(project.status)) {
      return project.status
    }
  }
  return 'pending'
}

// Project card component for kanban
function ProjectKanbanCard({ project }: { project: Project }) {
  const { t } = useTranslation('projects')
  return (
    <Card className="hover:shadow-md transition-shadow bg-white">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/knowledge/projects/${project.id}`}
            className="font-medium text-sm hover:text-primary hover:underline line-clamp-2"
          >
            {project.name}
          </Link>
          {project.project_type && (
            <Badge variant="outline" className="text-xs shrink-0">
              {project.project_type === 'company' ? t('projectTypes.company') :
               project.project_type === 'personal' ? t('projectTypes.personal') :
               project.project_type === 'open-source' ? t('projectTypes.openSource') : project.project_type}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {project.short_description && (
          <p className="text-xs text-gray-600 line-clamp-2">{project.short_description}</p>
        )}

        <div className="flex flex-wrap gap-1">
          {project.technologies?.slice(0, 4).map((tech) => (
            <TechBadge key={tech.id} tech={tech.name} size="sm" />
          ))}
          {project.technologies?.length > 4 && (
            <Badge variant="secondary" className="text-xs py-0">
              +{project.technologies.length - 4}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
          {project.start_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(project.start_date)}
            </span>
          )}
          {project.team_size && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {t('teamSizeValue', { count: project.team_size })}
            </span>
          )}
          {project.role && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {project.role}
            </span>
          )}
        </div>

        {project.git_url && (
          <a
            href={project.git_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Github className="h-3 w-3" />
            GitHub
            <ExternalLink className="h-2 w-2" />
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
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<ProjectFilters>({
    sort_by: 'is_analyzed,created_at',
    sort_order: 'asc,desc'
  })
  const selection = useSelection<number>()
  const [searchInput, setSearchInput] = useState('')
  const [formData, setFormData] = useState<ProjectCreate>({
    name: '',
    short_description: '',
    description: '',
    start_date: '',
    end_date: '',
    team_size: undefined,
    role: '',
    contribution_percent: undefined,
    git_url: '',
    project_type: 'company',
    company_id: undefined,
    technologies: [],
  })
  const [techInput, setTechInput] = useState('')
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>('')
  const [isLoadingRepoInfo, setIsLoadingRepoInfo] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isOngoing, setIsOngoing] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editFormData, setEditFormData] = useState<Partial<ProjectCreate>>({})
  const [editTechInput, setEditTechInput] = useState('')
  const [editIsOngoing, setEditIsOngoing] = useState(false)

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.company_id) count++
    if (filters.project_type) count++
    if (filters.status) count++
    if (filters.is_analyzed !== undefined) count++
    if (filters.start_date_from) count++
    if (filters.start_date_to) count++
    if (filters.technologies) count++
    if (filters.search) count++
    return count
  }, [filters])

  const clearFilters = () => {
    setFilters({
      sort_by: 'is_analyzed,created_at',
      sort_order: 'asc,desc'
    })
    setSearchInput('')
    selection.deselectAll()
  }

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, search: searchInput || undefined }))
  }

  // Check if GitHub is connected
  const isGitHubConnected = !!user?.github_username

  // Fetch GitHub repos if connected
  const { data: reposData } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id && isGitHubConnected,
  })

  // Sort repos by created_at descending (newest first)
  const githubRepos: GitHubRepo[] = (reposData?.data?.repos || [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Handle repo selection and auto-fill
  const handleRepoSelect = async (repoUrl: string) => {
    if (!repoUrl || repoUrl === 'manual') {
      setSelectedRepoUrl('')
      return
    }

    setSelectedRepoUrl(repoUrl)
    setFormData((prev) => ({ ...prev, git_url: repoUrl }))

    if (!user?.id) return

    setIsLoadingRepoInfo(true)
    try {
      // Fetch repo info and detect technologies in parallel
      const [infoResponse, techResponse] = await Promise.all([
        githubApi.getRepoInfo(user.id, repoUrl),
        githubApi.detectTechnologies(user.id, repoUrl),
      ])

      const info = infoResponse.data
      const technologies = techResponse.data.technologies || []

      const endDate = info.end_date || ''
      setFormData((prev) => ({
        ...prev,
        // name은 자동으로 채우지 않음 - 사용자가 직접 지정
        short_description: info.description || prev.short_description,
        git_url: info.html_url || repoUrl,
        start_date: info.start_date || prev.start_date,
        end_date: endDate,
        team_size: info.team_size || prev.team_size,
        contribution_percent: info.contribution_percent || prev.contribution_percent,
        project_type: 'personal',
        technologies: technologies.length > 0 ? technologies : prev.technologies,
      }))
      setIsOngoing(!endDate)

      toast({ title: t('repoInfoLoaded') })
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || t('repoInfoFailed')
      toast({ title: tc('error'), description: errorMessage, variant: 'destructive' })
    } finally {
      setIsLoadingRepoInfo(false)
    }
  }

  // Handle AI description generation (API or CLI mode)
  const handleGenerateAI = async () => {
    if (!user?.id || !formData.git_url) {
      toast({ title: t('gitUrlRequired'), variant: 'destructive' })
      return
    }

    const { aiMode, selectedCLI } = useAppStore.getState()
    const useCli = aiMode === 'cli' && isElectron()

    setIsGeneratingAI(true)
    try {
      if (useCli) {
        // CLI mode: generate via CLI tool
        const cli = selectedCLI as 'claude_code' | 'gemini_cli'
        const prompt = (
          `Analyze this GitHub repository and generate a project description for a resume/portfolio.\n` +
          `Repository URL: ${formData.git_url}\n` +
          `Project name: ${formData.name || 'Unknown'}\n\n` +
          `Return JSON with: { "short_description": "...", "description": "...", "technologies": ["..."] }`
        )

        const result = await generateWithCLI(prompt, cli)

        if (!result.success) {
          // CLI failed — suggest API fallback
          toast({
            title: t('aiGenerateError'),
            description: `CLI failed: ${result.error}. Try switching to API mode.`,
            variant: 'destructive',
          })
          return
        }

        // Track CLI call and tokens
        const providerKey = cli === 'claude_code' ? 'claude_code_cli' : 'gemini_cli'
        useUsageStore.getState().incrementLLMCallCount(providerKey as 'claude_code_cli' | 'gemini_cli')
        if (result.tokens && result.tokens > 0) {
          useUsageStore.getState().trackTokenUsage(providerKey as 'claude_code_cli' | 'gemini_cli', result.tokens)
        }

        // Try to parse JSON from CLI output
        let parsed: Record<string, unknown> = {}
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0])
          }
        } catch {
          // Use raw output as description
          parsed = { description: result.content }
        }

        setFormData((prev) => ({
          ...prev,
          short_description: (parsed.short_description as string) || prev.short_description,
          description: (parsed.description as string) || prev.description,
          technologies: Array.isArray(parsed.technologies) && parsed.technologies.length > 0
            ? [...new Set([...(prev.technologies || []), ...(parsed.technologies as string[])])]
            : prev.technologies,
        }))

        toast({ title: t('aiGenerated') })
      } else {
        // API mode: existing HTTP API
        const response = await githubApi.generateDescription(user.id, formData.git_url)
        const data = response.data

        setFormData((prev) => ({
          ...prev,
          short_description: data.short_description || prev.short_description,
          description: data.description || prev.description,
          technologies: data.technologies?.length > 0
            ? [...new Set([...(prev.technologies || []), ...data.technologies])]
            : prev.technologies,
        }))

        toast({ title: t('aiGenerated') })
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || t('aiGenerateFailed')
      toast({ title: t('aiGenerateError'), description: errorMessage, variant: 'destructive' })
    } finally {
      setIsGeneratingAI(false)
    }
  }

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

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['projects'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('projectAdded') })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || t('addFailed')
      toast({ title: tc('error'), description: errorMessage, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['projects'] })
      toast({ title: t('projectDeleted') })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || t('deleteFailed')
      toast({ title: tc('error'), description: errorMessage, variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProjectCreate> }) =>
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['projects'] })
      setEditingProject(null)
      toast({ title: t('projectUpdated') })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || t('updateFailed')
      toast({ title: tc('error'), description: errorMessage, variant: 'destructive' })
    },
  })

  // Batch delete mutation
  const batchDeleteMutation = useMutation({
    mutationFn: (projectIds: number[]) => projectsApi.deleteBatch(projectIds),
    onSuccess: (response) => {
      const { deleted_count, not_found_ids } = response.data
      queryClient.refetchQueries({ queryKey: ['projects'] })
      selection.deselectAll()
      toast({
        title: t('batchDeleteComplete'),
        description: t('batchDeleteResult', { count: deleted_count }),
        variant: not_found_ids.length > 0 ? 'destructive' : 'default',
      })
    },
    onError: (error: any) => {
      // Handle FastAPI validation error response which can be an array
      let errorMessage = t('batchDeleteFailed')
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        errorMessage = detail
      } else if (Array.isArray(detail) && detail[0]?.msg) {
        errorMessage = detail[0].msg
      }
      toast({ title: tc('error'), description: errorMessage, variant: 'destructive' })
    },
  })

  // Handle batch delete for selected projects
  const handleSelectedBatchDelete = () => {
    if (selection.selectedCount === 0) {
      toast({
        title: t('noDeleteTarget'),
        description: t('noSelectedProjects'),
        variant: 'destructive',
      })
      return
    }
    setIsBatchDeleteDialogOpen(true)
  }

  // Confirm batch delete
  const confirmBatchDelete = () => {
    batchDeleteMutation.mutate(selection.getSelectedArray())
    setIsBatchDeleteDialogOpen(false)
  }

  // Handle single project delete
  const handleSingleDelete = (project: Project) => {
    setDeleteTarget({ id: project.id, name: project.name })
  }

  // Handle opening edit modal
  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setEditFormData({
      name: project.name,
      short_description: project.short_description || '',
      description: project.description || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      team_size: project.team_size ?? undefined,
      role: project.role || '',
      contribution_percent: project.contribution_percent ?? undefined,
      git_url: project.git_url || '',
      project_type: project.project_type || 'company',
      company_id: project.company_id ?? undefined,
      technologies: project.technologies?.map(t => t.name) || [],
    })
    setEditIsOngoing(!project.end_date)
    setEditTechInput('')
  }

  // Handle edit form submission
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject) return

    const cleanedData: Partial<ProjectCreate> = {
      name: editFormData.name,
      short_description: editFormData.short_description || undefined,
      description: editFormData.description || undefined,
      start_date: editFormData.start_date || undefined,
      end_date: editFormData.end_date || undefined,
      team_size: editFormData.team_size,
      role: editFormData.role || undefined,
      contribution_percent: editFormData.contribution_percent,
      git_url: editFormData.git_url || undefined,
      project_type: editFormData.project_type || undefined,
      company_id: editFormData.company_id,
      technologies: editFormData.technologies,
    }
    updateMutation.mutate({ id: editingProject.id, data: cleanedData })
  }

  // Add/remove tech for edit form
  const addEditTechnology = () => {
    if (editTechInput.trim() && !editFormData.technologies?.includes(editTechInput.trim())) {
      setEditFormData({
        ...editFormData,
        technologies: [...(editFormData.technologies || []), editTechInput.trim()],
      })
      setEditTechInput('')
    }
  }

  const removeEditTechnology = (tech: string) => {
    setEditFormData({
      ...editFormData,
      technologies: editFormData.technologies?.filter((t) => t !== tech),
    })
  }

  // Confirm single delete
  const confirmSingleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  // Kanban status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      projectsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['projects'] })
    },
    onError: () => {
      toast({
        title: tc('error'),
        description: t('statusChangeFailed'),
        variant: 'destructive',
      })
    },
  })

  // Batch analysis mutation
  const batchAnalyzeMutation = useMutation({
    mutationFn: (projectIds: number[]) => {
      // Get LLM settings from app store
      const { aiMode, selectedCLI, claudeCodeModel, geminiCLIModel, selectedLLMProvider } = useAppStore.getState()
      const useCli = aiMode === 'cli' && isElectron()

      const options: Parameters<typeof githubApi.analyzeBatch>[2] = {}
      if (useCli) {
        options.cli_mode = selectedCLI as 'claude_code' | 'gemini_cli'
        options.cli_model = selectedCLI === 'claude_code' ? claudeCodeModel : geminiCLIModel
        console.log('[BatchAnalysis] Using CLI mode:', options.cli_mode, 'model:', options.cli_model)
      } else if (selectedLLMProvider) {
        options.llm_provider = selectedLLMProvider
        console.log('[BatchAnalysis] Using API mode:', options.llm_provider)
      }

      return githubApi.analyzeBatch(user!.id, projectIds, options)
    },
    onMutate: (projectIds) => {
      setBatchProgress({ current: 0, total: projectIds.length })
    },
    onSuccess: (response) => {
      const { completed, failed, results } = response.data
      setBatchProgress(null)
      selection.deselectAll() // Clear selections after batch analysis

      toast({
        title: t('batchAnalysisComplete'),
        description: t('batchAnalysisResult', { completed, failed }),
        variant: failed > 0 ? 'destructive' : 'default',
      })

      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.warn(`[Batch Analysis] ${r.project_name}: ${r.message}`)
        })

      queryClient.refetchQueries({ queryKey: ['projects'] })
    },
    onError: (error: any) => {
      setBatchProgress(null)
      toast({
        title: t('batchAnalysisError'),
        description: error?.response?.data?.detail || t('batchAnalysisFailed'),
        variant: 'destructive',
      })
    },
  })

  // Handle batch analysis for selected projects
  const handleSelectedBatchAnalyze = () => {
    if (selectedAnalyzableProjects.length === 0) {
      toast({
        title: t('noAnalysisTarget'),
        description: t('noSelectedAnalyzable'),
        variant: 'destructive',
      })
      return
    }
    batchAnalyzeMutation.mutate(selectedAnalyzableProjects.map((p) => p.id))
  }

  const resetForm = () => {
    setFormData({
      name: '',
      short_description: '',
      description: '',
      start_date: '',
      end_date: '',
      team_size: undefined,
      role: '',
      contribution_percent: undefined,
      git_url: '',
      project_type: 'company',
      company_id: undefined,
      technologies: [],
    })
    setTechInput('')
    setSelectedRepoUrl('')
    setIsOngoing(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Clean up empty strings to undefined for optional fields
    const cleanedData: ProjectCreate = {
      name: formData.name,
      short_description: formData.short_description || undefined,
      description: formData.description || undefined,
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      team_size: formData.team_size,
      role: formData.role || undefined,
      contribution_percent: formData.contribution_percent,
      git_url: formData.git_url || undefined,
      project_type: formData.project_type || undefined,
      company_id: formData.company_id,
      technologies: formData.technologies,
    }
    createMutation.mutate(cleanedData)
  }

  const addTechnology = () => {
    if (techInput.trim() && !formData.technologies?.includes(techInput.trim())) {
      setFormData({
        ...formData,
        technologies: [...(formData.technologies || []), techInput.trim()],
      })
      setTechInput('')
    }
  }

  const removeTechnology = (tech: string) => {
    setFormData({
      ...formData,
      technologies: formData.technologies?.filter((t) => t !== tech),
    })
  }

  const projects = projectsData?.data?.projects || []
  const companies = companiesData?.data || []

  // Get selected projects that can be analyzed (have git_url and not analyzed)
  const selectedAnalyzableProjects = projects.filter(
    p => selection.isSelected(p.id) && p.git_url && !p.is_analyzed
  )

  // Kanban data preparation
  const kanbanItems: ProjectKanbanItem[] = projects.map((project) => ({
    id: project.id,
    columnId: getColumnId(project),
    project,
  }))

  const columns: KanbanColumn[] = createKanbanColumns(kanbanItems, PROJECT_STATUS_COLUMNS)

  // Get pending projects (with git_url but not analyzed)
  const pendingProjects = projects.filter(
    (p) => p.git_url && !p.is_analyzed && (p.status === 'pending' || !p.status)
  )

  // Handle moving items between columns
  const handleMove = (
    itemId: string | number,
    _fromColumn: string,
    toColumn: string,
    _newIndex: number
  ) => {
    const projectId = typeof itemId === 'string' ? parseInt(itemId) : itemId
    updateStatusMutation.mutate({ id: projectId, status: toColumn })
    const columnName = PROJECT_STATUS_COLUMNS.find(c => c.id === toColumn)?.title || toColumn
    toast({
      title: t('statusChanged'),
      description: t('statusChangedTo', { column: columnName }),
    })
  }

  // Handle reordering within the same column
  const handleReorder = (_columnId: string, _items: ProjectKanbanItem[]) => {
    // Reordering within column - could save display_order if needed
  }

  // Handle batch analysis
  const handleBatchAnalyze = () => {
    if (pendingProjects.length === 0) {
      toast({
        title: t('noAnalysisTarget'),
        description: t('noPendingProjects'),
        variant: 'destructive',
      })
      return
    }
    batchAnalyzeMutation.mutate(pendingProjects.map((p) => p.id))
  }

  // Render project card in kanban
  const renderItem = (item: ProjectKanbanItem) => (
    <ProjectKanbanCard project={item.project} />
  )

  // Render drag overlay
  const renderOverlay = (item: ProjectKanbanItem) => (
    <ProjectKanbanCard project={item.project} />
  )

  // Empty state for columns
  const renderEmptyState = () => (
    <span>{t('dragProjectHere')}</span>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'kanban' && pendingProjects.length > 0 && (
            <Button
              onClick={handleBatchAnalyze}
              disabled={batchAnalyzeMutation.isPending}
              variant="outline"
            >
              {batchAnalyzeMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {batchAnalyzeMutation.isPending
                ? t('analyzing', { current: batchProgress?.current || 0, total: batchProgress?.total || 0 })
                : t('batchAnalysis', { count: pendingProjects.length })
              }
            </Button>
          )}
          <Link to="/github/repos">
            <Button variant="outline">
              <Github className="h-4 w-4 mr-2" />
              {t('importRepos')}
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setIsExportDialogOpen(true)}
          >
            <FileDown className="h-4 w-4 mr-2" />
            {t('exportProjects')}
          </Button>
          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              {t('listView')}
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('kanban')}
            >
              <Kanban className="h-4 w-4 mr-1" />
              {t('kanbanView')}
            </Button>
          </div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('addProject')}
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>
            {tc('search')}
          </Button>
        </div>
        <Button
          variant={isFilterOpen ? 'secondary' : 'outline'}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          <Filter className="h-4 w-4 mr-2" />
          {t('filter')}
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Filter Panel */}
      <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <CollapsibleContent>
          <Card className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t('filters.company')}</Label>
                <Select
                  value={filters.company_id?.toString() || 'all'}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    company_id: v === 'all' ? undefined : parseInt(v)
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.all')}</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('filters.projectType')}</Label>
                <Select
                  value={filters.project_type || 'all'}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    project_type: v === 'all' ? undefined : v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.all')}</SelectItem>
                    <SelectItem value="company">{t('projectTypes.companyProject')}</SelectItem>
                    <SelectItem value="personal">{t('projectTypes.personalProject')}</SelectItem>
                    <SelectItem value="open-source">{t('projectTypes.openSource')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('filters.status')}</Label>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    status: v === 'all' ? undefined : v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.all')}</SelectItem>
                    <SelectItem value="pending">{t('status.pending')}</SelectItem>
                    <SelectItem value="analyzing">{t('status.analyzing')}</SelectItem>
                    <SelectItem value="review">{t('status.review')}</SelectItem>
                    <SelectItem value="completed">{t('status.completed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('filters.analyzed')}</Label>
                <Select
                  value={filters.is_analyzed === undefined ? 'all' : filters.is_analyzed.toString()}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    is_analyzed: v === 'all' ? undefined : v === 'true'
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.all')}</SelectItem>
                    <SelectItem value="true">{t('analyzed')}</SelectItem>
                    <SelectItem value="false">{t('notAnalyzed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('filters.startDateFrom')}</Label>
                <Input
                  type="date"
                  value={filters.start_date_from || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    start_date_from: e.target.value || undefined
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('filters.startDateTo')}</Label>
                <Input
                  type="date"
                  value={filters.start_date_to || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    start_date_to: e.target.value || undefined
                  }))}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>{t('filters.techStack')}</Label>
                <Input
                  placeholder="React, TypeScript, Node.js..."
                  value={filters.technologies || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    technologies: e.target.value || undefined
                  }))}
                />
              </div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Results count */}
      {projectsData?.data && (
        <div className="text-sm text-gray-500">
          {t('projectCount', { count: projectsData.data.total })}
          {activeFilterCount > 0 && ` (${t('filterApplied')})`}
        </div>
      )}

      {/* Batch analysis progress */}
      {batchProgress && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('batchAnalysisInProgress')}</span>
                  <span className="text-sm text-gray-500">
                    {batchProgress.current} / {batchProgress.total}
                  </span>
                </div>
                <Progress
                  value={(batchProgress.current / batchProgress.total) * 100}
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-8">{tc('loading')}</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noProjects')}</h3>
            <p className="text-gray-500 mb-4">{t('noProjectsDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('addFirstProject')}
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="space-y-4">
          {/* Selection Action Bar */}
          <SelectionActionBar
            totalCount={projects.length}
            selectedCount={selection.selectedCount}
            onSelectAllChange={(selectAll) => {
              if (selectAll) {
                selection.selectAll(projects.map(p => p.id))
              } else {
                selection.deselectAll()
              }
            }}
            selectAllLabel={t('selectAll')}
            selectedCountLabel={`(${selection.selectedCount} ${tc('selected')})`}
          >
            <Button
              onClick={handleSelectedBatchAnalyze}
              disabled={batchAnalyzeMutation.isPending || selectedAnalyzableProjects.length === 0}
              size="sm"
            >
              {batchAnalyzeMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {t('analyze')} ({selectedAnalyzableProjects.length})
            </Button>
            <Button
              onClick={handleSelectedBatchDelete}
              disabled={batchDeleteMutation.isPending}
              size="sm"
              variant="destructive"
            >
              {batchDeleteMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {tc('delete')} ({selection.selectedCount})
            </Button>
          </SelectionActionBar>

          {/* Project List */}
          <div className="grid gap-4">
            {projects.map((project) => (
              <SelectableTile
                key={project.id}
                id={project.id}
                selected={selection.isSelected(project.id)}
                onSelectChange={() => selection.toggle(project.id)}
                className="hover:shadow-md"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          to={`/knowledge/projects/${project.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <h3 className="text-xl font-semibold">{project.name}</h3>
                        </Link>
                        {project.is_analyzed ? (
                          <Badge variant="success">{t('analyzed')}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">{t('notAnalyzed')}</Badge>
                        )}
                        {project.project_type && (
                          <Badge variant="outline">{project.project_type}</Badge>
                        )}
                      </div>
                      {project.short_description && (
                        <p className="text-gray-700">{project.short_description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                        {project.start_date && (
                          <span>
                            {formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : t('ongoing')}
                          </span>
                        )}
                        {project.role && <span>· {project.role}</span>}
                        {project.team_size && <span>· {t('teamSizeValue', { count: project.team_size })}</span>}
                      </div>
                      {project.technologies?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {project.technologies.map((tech) => (
                            <TechBadge key={tech.id} tech={tech.name} />
                          ))}
                        </div>
                      )}
                      {project.git_url && (
                        <div className="mt-3">
                          <a
                            href={project.git_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-sm text-primary rounded-md hover:bg-primary/5 hover:underline transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Github className="h-4 w-4" />
                            <span>GitHub</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditProject(project)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSingleDelete(project)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </SelectableTile>
            ))}
          </div>
        </div>
      ) : (
        /* Kanban View */
        <>
          <div className="overflow-x-auto pb-4">
            <KanbanBoard<ProjectKanbanItem>
              columns={columns}
              onMove={handleMove}
              onReorder={handleReorder}
              renderItem={renderItem}
              renderOverlay={renderOverlay}
              renderEmptyState={renderEmptyState}
            />
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-4 gap-4">
            {PROJECT_STATUS_COLUMNS.map((col) => {
              const count = columns.find(c => c.id === col.id)?.items.length || 0
              return (
                <Card key={col.id}>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-gray-500">{col.title}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* GitHub Repo Selection */}
            {isGitHubConnected && githubRepos.length > 0 && (
              <div className="space-y-2">
                <Label>{t('dialog.importFromGithub')}</Label>
                <Select
                  value={selectedRepoUrl}
                  onValueChange={handleRepoSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('dialog.selectRepo')}>
                      {isLoadingRepoInfo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t('dialog.manualInput')}</SelectItem>
                    {githubRepos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.html_url}>
                        <div className="flex items-center gap-2">
                          <Github className="h-4 w-4" />
                          <span>{repo.full_name}</span>
                          {repo.language && (
                            <Badge variant="outline" className="text-xs">{repo.language}</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {t('dialog.repoSelectionHint')}
                </p>
              </div>
            )}

            {isLoadingRepoInfo && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-gray-500">{t('dialog.loadingRepoInfo')}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{t('dialog.projectName')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('dialog.projectNamePlaceholder')}
                required
              />
              <p className="text-xs text-gray-500">
                {t('dialog.projectNameHint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="short_description">{t('dialog.shortDesc')}</Label>
              <Input
                id="short_description"
                value={formData.short_description}
                onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                placeholder={t('dialog.shortDescPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('dialog.projectType')}</Label>
                <Select
                  value={formData.project_type}
                  onValueChange={(v) => setFormData({ ...formData, project_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">{t('projectTypes.companyProject')}</SelectItem>
                    <SelectItem value="personal">{t('projectTypes.personalProject')}</SelectItem>
                    <SelectItem value="open-source">{t('projectTypes.openSource')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('dialog.company')}</Label>
                <Select
                  value={formData.company_id?.toString() || ''}
                  onValueChange={(v) => setFormData({ ...formData, company_id: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('dialog.selectOptional')} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('dialog.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date || ''}
                  max={formData.end_date || undefined}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('dialog.endDate')}</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date || ''}
                  min={formData.start_date || undefined}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  disabled={isOngoing}
                  className={isOngoing ? 'bg-gray-100 cursor-not-allowed' : ''}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_ongoing"
                checked={isOngoing}
                onChange={(e) => {
                  setIsOngoing(e.target.checked)
                  if (e.target.checked) {
                    setFormData({ ...formData, end_date: '' })
                  }
                }}
              />
              <Label htmlFor="is_ongoing" className="cursor-pointer">{t('dialog.ongoingProject')}</Label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">{t('dialog.role')}</Label>
                <Input
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder={t('dialog.rolePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team_size">{t('dialog.teamSize')}</Label>
                <Input
                  id="team_size"
                  type="number"
                  value={formData.team_size || ''}
                  onChange={(e) => setFormData({ ...formData, team_size: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contribution_percent">{t('dialog.contribution')}</Label>
                <Input
                  id="contribution_percent"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.contribution_percent || ''}
                  onChange={(e) => setFormData({ ...formData, contribution_percent: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="70"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="git_url">{t('dialog.githubUrl')}</Label>
              <div className="flex gap-2">
                <Input
                  id="git_url"
                  value={formData.git_url}
                  onChange={(e) => setFormData({ ...formData, git_url: e.target.value })}
                  placeholder="https://github.com/username/repo"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateAI}
                  disabled={!formData.git_url || isGeneratingAI}
                >
                  {isGeneratingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {t('dialog.generateAI')}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                {t('dialog.aiGenerateHint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('dialog.techStack')}</Label>
              <div className="flex gap-2">
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  placeholder={t('dialog.techInputPlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTechnology()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTechnology}>
                  {tc('add')}
                </Button>
              </div>
              {formData.technologies && formData.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.technologies.map((tech) => (
                    <TechBadge
                      key={tech}
                      tech={tech}
                      className="cursor-pointer hover:opacity-80"
                      onClick={() => removeTechnology(tech)}
                    />
                  ))}
                  <span className="text-xs text-gray-500 self-center ml-1">({t('dialog.clickToRemove')})</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('dialog.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {tc('add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ScrollToTop />

      {/* Edit Project Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_name">{t('dialog.projectName')} *</Label>
              <Input
                id="edit_name"
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder={t('dialog.projectNamePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_short_description">{t('dialog.shortDesc')}</Label>
              <Input
                id="edit_short_description"
                value={editFormData.short_description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, short_description: e.target.value })}
                placeholder={t('dialog.shortDescPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('dialog.projectType')}</Label>
                <Select
                  value={editFormData.project_type || 'company'}
                  onValueChange={(v) => setEditFormData({ ...editFormData, project_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">{t('projectTypes.companyProject')}</SelectItem>
                    <SelectItem value="personal">{t('projectTypes.personalProject')}</SelectItem>
                    <SelectItem value="open-source">{t('projectTypes.openSource')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('dialog.company')}</Label>
                <Select
                  value={editFormData.company_id?.toString() || ''}
                  onValueChange={(v) => setEditFormData({ ...editFormData, company_id: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('dialog.selectOptional')} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_start_date">{t('dialog.startDate')}</Label>
                <Input
                  id="edit_start_date"
                  type="date"
                  value={editFormData.start_date || ''}
                  max={editFormData.end_date || undefined}
                  onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_end_date">{t('dialog.endDate')}</Label>
                <Input
                  id="edit_end_date"
                  type="date"
                  value={editFormData.end_date || ''}
                  min={editFormData.start_date || undefined}
                  onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                  disabled={editIsOngoing}
                  className={editIsOngoing ? 'bg-gray-100 cursor-not-allowed' : ''}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_is_ongoing"
                checked={editIsOngoing}
                onChange={(e) => {
                  setEditIsOngoing(e.target.checked)
                  if (e.target.checked) {
                    setEditFormData({ ...editFormData, end_date: '' })
                  }
                }}
              />
              <Label htmlFor="edit_is_ongoing" className="cursor-pointer">{t('dialog.ongoingProject')}</Label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_role">{t('dialog.role')}</Label>
                <Input
                  id="edit_role"
                  value={editFormData.role || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  placeholder={t('dialog.rolePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_team_size">{t('dialog.teamSize')}</Label>
                <Input
                  id="edit_team_size"
                  type="number"
                  value={editFormData.team_size || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, team_size: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_contribution_percent">{t('dialog.contribution')}</Label>
                <Input
                  id="edit_contribution_percent"
                  type="number"
                  min="0"
                  max="100"
                  value={editFormData.contribution_percent || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, contribution_percent: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="70"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_git_url">{t('dialog.githubUrl')}</Label>
              <Input
                id="edit_git_url"
                value={editFormData.git_url || ''}
                onChange={(e) => setEditFormData({ ...editFormData, git_url: e.target.value })}
                placeholder="https://github.com/username/repo"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dialog.techStack')}</Label>
              <div className="flex gap-2">
                <Input
                  value={editTechInput}
                  onChange={(e) => setEditTechInput(e.target.value)}
                  placeholder={t('dialog.techInputPlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addEditTechnology()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addEditTechnology}>
                  {tc('add')}
                </Button>
              </div>
              {editFormData.technologies && editFormData.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {editFormData.technologies.map((tech) => (
                    <TechBadge
                      key={tech}
                      tech={tech}
                      className="cursor-pointer hover:opacity-80"
                      onClick={() => removeEditTechnology(tech)}
                    />
                  ))}
                  <span className="text-xs text-gray-500 self-center ml-1">({t('dialog.clickToRemove')})</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_description">{t('dialog.description')}</Label>
              <Textarea
                id="edit_description"
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProject(null)}>
                {tc('cancel')}
              </Button>
              <Link to={`/knowledge/projects/${editingProject?.id}`}>
                <Button type="button" variant="secondary">
                  {t('editDialog.viewDetail')}
                </Button>
              </Link>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
      />

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.singleDescription', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSingleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog open={isBatchDeleteDialogOpen} onOpenChange={setIsBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.batchDescription', { count: selection.selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBatchDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('deleteDialog.confirmBatch', { count: selection.selectedCount })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
