import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { projectsApi, companiesApi, ProjectCreate } from '@/api/knowledge'
import { githubApi, GitHubRepo } from '@/api/github'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, FolderKanban, Github, ExternalLink, Loader2, Sparkles } from 'lucide-react'

export default function ProjectsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
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

  // Check if GitHub is connected
  const isGitHubConnected = !!user?.github_username

  // Fetch GitHub repos if connected
  const { data: reposData } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, 1, 100),
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

      setFormData((prev) => ({
        ...prev,
        name: info.name || prev.name,
        short_description: info.description || prev.short_description,
        git_url: info.html_url || repoUrl,
        start_date: info.start_date || prev.start_date,
        end_date: info.end_date || prev.end_date,
        team_size: info.team_size || prev.team_size,
        contribution_percent: info.contribution_percent || prev.contribution_percent,
        project_type: 'personal',
        technologies: technologies.length > 0 ? technologies : prev.technologies,
      }))

      toast({ title: '레포지토리 정보와 기술 스택을 불러왔습니다.' })
    } catch {
      toast({ title: '정보 불러오기 실패', description: '레포지토리 정보를 불러오지 못했습니다.', variant: 'destructive' })
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
    } catch {
      toast({ title: 'AI 생성 실패', description: 'AI로 설명을 생성하지 못했습니다.', variant: 'destructive' })
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id),
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
    onError: () => toast({ title: '오류', description: '프로젝트 추가에 실패했습니다.', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({ title: '프로젝트가 삭제되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '삭제에 실패했습니다.', variant: 'destructive' }),
  })

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">프로젝트 관리</h1>
          <p className="text-gray-600">포트폴리오에 포함될 프로젝트를 관리합니다.</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          프로젝트 추가
        </Button>
      </div>

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
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link to={`/knowledge/projects/${project.id}`} className="hover:underline">
                        <h3 className="text-xl font-semibold">{project.name}</h3>
                      </Link>
                      {project.is_analyzed && <Badge variant="success">분석됨</Badge>}
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
                          <Badge key={tech.id} variant="secondary">
                            {tech.name}
                          </Badge>
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
                required
              />
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
                />
              </div>
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
                    <Badge
                      key={tech}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeTechnology(tech)}
                    >
                      {tech} ×
                    </Badge>
                  ))}
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
    </div>
  )
}
