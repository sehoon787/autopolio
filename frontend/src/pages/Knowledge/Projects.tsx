import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
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
import { Plus, Pencil, Trash2, FolderKanban, Github, ExternalLink, Loader2, Sparkles, Kanban, List, Filter, X, Search, Play, RefreshCw, Calendar, Users, Briefcase } from 'lucide-react'

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
              {project.project_type === 'company' ? '회사' :
               project.project_type === 'personal' ? '개인' :
               project.project_type === 'open-source' ? 'OSS' : project.project_type}
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
              {project.team_size}명
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
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
    setSelectedIds(new Set())
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

      toast({ title: '레포지토리 정보와 기술 스택을 불러왔습니다.' })
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || '레포지토리 정보를 불러오지 못했습니다.'
      toast({ title: '정보 불러오기 실패', description: errorMessage, variant: 'destructive' })
    } finally {
      setIsLoadingRepoInfo(false)
    }
  }

  // Handle AI description generation
  const handleGenerateAI = async () => {
    if (!user?.id || !formData.git_url) {
      toast({ title: 'GitHub URL이 필요합니다.', variant: 'destructive' })
      return
    }

    setIsGeneratingAI(true)
    try {
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

      toast({ title: 'AI가 설명을 생성했습니다.' })
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || 'AI로 설명을 생성하지 못했습니다.'
      toast({ title: 'AI 생성 실패', description: errorMessage, variant: 'destructive' })
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
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: '프로젝트가 추가되었습니다.' })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || '프로젝트 추가에 실패했습니다.'
      toast({ title: '오류', description: errorMessage, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({ title: '프로젝트가 삭제되었습니다.' })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || '삭제에 실패했습니다.'
      toast({ title: '오류', description: errorMessage, variant: 'destructive' })
    },
  })

  // Kanban status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      projectsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: () => {
      toast({
        title: '오류',
        description: '프로젝트 상태 변경에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  // Batch analysis mutation
  const batchAnalyzeMutation = useMutation({
    mutationFn: (projectIds: number[]) =>
      githubApi.analyzeBatch(user!.id, projectIds),
    onMutate: (projectIds) => {
      setBatchProgress({ current: 0, total: projectIds.length })
    },
    onSuccess: (response) => {
      const { completed, failed, results } = response.data
      setBatchProgress(null)
      setSelectedIds(new Set()) // Clear selections after batch analysis

      toast({
        title: '일괄 분석 완료',
        description: `${completed}개 완료, ${failed}개 실패`,
        variant: failed > 0 ? 'destructive' : 'default',
      })

      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.warn(`[Batch Analysis] ${r.project_name}: ${r.message}`)
        })

      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: any) => {
      setBatchProgress(null)
      toast({
        title: '일괄 분석 오류',
        description: error?.response?.data?.detail || '일괄 분석에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  // Handle batch analysis for selected projects
  const handleSelectedBatchAnalyze = () => {
    if (selectedAnalyzableProjects.length === 0) {
      toast({
        title: '분석 대상 없음',
        description: '선택한 프로젝트 중 분석 가능한 항목이 없습니다. (Git URL이 있고 미분석 상태여야 합니다)',
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

  // Selection handlers (must be after projects is defined)
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(projects.map(p => p.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    setSelectedIds(newSet)
  }

  // Get selected projects that can be analyzed (have git_url and not analyzed)
  const selectedAnalyzableProjects = projects.filter(
    p => selectedIds.has(p.id) && p.git_url && !p.is_analyzed
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
    toast({
      title: '프로젝트 상태 변경',
      description: `프로젝트가 "${PROJECT_STATUS_COLUMNS.find(c => c.id === toColumn)?.title || toColumn}"(으)로 이동되었습니다.`,
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
        title: '분석 대상 없음',
        description: '분석 대기 중인 프로젝트가 없습니다.',
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
    <span>프로젝트를 이 컬럼으로 드래그하세요</span>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">프로젝트 관리</h1>
          <p className="text-gray-600">포트폴리오에 포함될 프로젝트를 관리합니다.</p>
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
                ? `분석 중 (${batchProgress?.current || 0}/${batchProgress?.total || 0})`
                : `일괄 분석 (${pendingProjects.length})`
              }
            </Button>
          )}
          <Link to="/github/repos">
            <Button variant="outline">
              <Github className="h-4 w-4 mr-2" />
              레포 가져오기
            </Button>
          </Link>
          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              리스트
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('kanban')}
            >
              <Kanban className="h-4 w-4 mr-1" />
              칸반
            </Button>
          </div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            프로젝트 추가
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="프로젝트명 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>
            검색
          </Button>
        </div>
        <Button
          variant={isFilterOpen ? 'secondary' : 'outline'}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          <Filter className="h-4 w-4 mr-2" />
          필터
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            필터 초기화
          </Button>
        )}
      </div>

      {/* Filter Panel */}
      <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <CollapsibleContent>
          <Card className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>회사</Label>
                <Select
                  value={filters.company_id?.toString() || 'all'}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    company_id: v === 'all' ? undefined : parseInt(v)
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>프로젝트 유형</Label>
                <Select
                  value={filters.project_type || 'all'}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    project_type: v === 'all' ? undefined : v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="company">회사 프로젝트</SelectItem>
                    <SelectItem value="personal">개인 프로젝트</SelectItem>
                    <SelectItem value="open-source">오픈소스</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>상태</Label>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    status: v === 'all' ? undefined : v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                    <SelectItem value="analyzing">분석 중</SelectItem>
                    <SelectItem value="review">검토 중</SelectItem>
                    <SelectItem value="completed">완료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>분석 여부</Label>
                <Select
                  value={filters.is_analyzed === undefined ? 'all' : filters.is_analyzed.toString()}
                  onValueChange={(v) => setFilters(prev => ({
                    ...prev,
                    is_analyzed: v === 'all' ? undefined : v === 'true'
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="true">분석됨</SelectItem>
                    <SelectItem value="false">미분석</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>시작일 (부터)</Label>
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
                <Label>시작일 (까지)</Label>
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
                <Label>기술 스택 (쉼표로 구분)</Label>
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
          {projectsData.data.total}개의 프로젝트
          {activeFilterCount > 0 && ' (필터 적용됨)'}
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
                  <span className="text-sm font-medium">일괄 분석 진행 중...</span>
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
        <div className="text-center py-8">로딩 중...</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">등록된 프로젝트가 없습니다</h3>
            <p className="text-gray-500 mb-4">포트폴리오에 포함할 프로젝트를 추가해주세요.</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              첫 프로젝트 추가
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="space-y-4">
          {/* Selection Action Bar */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
            <div className="flex items-center gap-3">
              <Checkbox
                id="select-all"
                checked={selectedIds.size === projects.length && projects.length > 0}
                onCheckedChange={(checked) => handleSelectAll(checked === true)}
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                전체 선택
              </label>
              {selectedIds.size > 0 && (
                <span className="text-sm text-gray-500">
                  ({selectedIds.size}개 선택됨)
                </span>
              )}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
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
                  선택 분석 ({selectedAnalyzableProjects.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="h-4 w-4 mr-1" />
                  선택 해제
                </Button>
              </div>
            )}
          </div>

          {/* Project List */}
          <div className="grid gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                className={`hover:shadow-md transition-shadow ${selectedIds.has(project.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <div className="pt-1">
                      <Checkbox
                        checked={selectedIds.has(project.id)}
                        onCheckedChange={(checked) => handleSelectOne(project.id, checked === true)}
                      />
                    </div>
                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link to={`/knowledge/projects/${project.id}`} className="hover:underline">
                          <h3 className="text-xl font-semibold">{project.name}</h3>
                        </Link>
                        {project.is_analyzed ? (
                          <Badge variant="success">분석됨</Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">미분석</Badge>
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
                            {formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : '진행중'}
                          </span>
                        )}
                        {project.role && <span>· {project.role}</span>}
                        {project.team_size && <span>· {project.team_size}명</span>}
                      </div>
                      {project.technologies?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {project.technologies.map((tech) => (
                            <TechBadge key={tech.id} tech={tech.name} />
                          ))}
                        </div>
                      )}
                      {project.git_url && (
                        <a
                          href={project.git_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-primary mt-3 hover:underline"
                        >
                          <Github className="h-4 w-4" />
                          GitHub
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link to={`/knowledge/projects/${project.id}`}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('정말 삭제하시겠습니까?')) {
                            deleteMutation.mutate(project.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
            <DialogTitle>새 프로젝트 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* GitHub Repo Selection */}
            {isGitHubConnected && githubRepos.length > 0 && (
              <div className="space-y-2">
                <Label>GitHub 레포지토리에서 불러오기</Label>
                <Select
                  value={selectedRepoUrl}
                  onValueChange={handleRepoSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="레포지토리 선택 (선택사항)">
                      {isLoadingRepoInfo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">직접 입력</SelectItem>
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
                  레포지토리를 선택하면 시작일, 종료일, 팀 규모, 기여도, 기술 스택이 자동으로 채워집니다.
                </p>
              </div>
            )}

            {isLoadingRepoInfo && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-gray-500">레포지토리 정보 불러오는 중...</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">프로젝트명 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 결제 시스템 고도화"
                required
              />
              <p className="text-xs text-gray-500">
                GitHub 레포지토리 이름과 관계없이 원하는 프로젝트명을 지정하세요.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="short_description">간단 설명</Label>
              <Input
                id="short_description"
                value={formData.short_description}
                onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                placeholder="한 줄 요약"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>프로젝트 유형</Label>
                <Select
                  value={formData.project_type}
                  onValueChange={(v) => setFormData({ ...formData, project_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">회사 프로젝트</SelectItem>
                    <SelectItem value="personal">개인 프로젝트</SelectItem>
                    <SelectItem value="open-source">오픈소스</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>회사</Label>
                <Select
                  value={formData.company_id?.toString() || ''}
                  onValueChange={(v) => setFormData({ ...formData, company_id: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택 (선택사항)" />
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
                <Label htmlFor="start_date">시작일</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">종료일</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
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
              <Label htmlFor="is_ongoing" className="cursor-pointer">현재 진행중인 프로젝트</Label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">역할</Label>
                <Input
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="백엔드 개발"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team_size">팀 규모</Label>
                <Input
                  id="team_size"
                  type="number"
                  value={formData.team_size || ''}
                  onChange={(e) => setFormData({ ...formData, team_size: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contribution_percent">기여도 (%)</Label>
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
              <Label htmlFor="git_url">GitHub URL</Label>
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
                  AI 설명 생성
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                "AI 설명 생성" 버튼을 클릭하면 README 기반으로 설명이 자동 생성됩니다. (기술 스택은 레포 선택 시 자동 감지)
              </p>
            </div>
            <div className="space-y-2">
              <Label>기술 스택</Label>
              <div className="flex gap-2">
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  placeholder="기술명 입력 후 추가"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTechnology()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTechnology}>
                  추가
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
                  <span className="text-xs text-gray-500 self-center ml-1">(클릭하여 제거)</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">상세 설명</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                추가
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ScrollToTop />
    </div>
  )
}
