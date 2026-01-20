import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usePipelineStore } from '@/stores/pipelineStore'
import { projectsApi } from '@/api/knowledge'
import { templatesApi } from '@/api/templates'
import { pipelineApi, PipelineRunRequest } from '@/api/pipeline'
import { Play, FolderKanban } from 'lucide-react'

export default function GeneratePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useUserStore()
  const { setTaskId, setRequest } = usePipelineStore()

  const [selectedProjects, setSelectedProjects] = useState<number[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [outputFormat, setOutputFormat] = useState<string>('docx')
  const [documentName, setDocumentName] = useState<string>('')
  const [options, setOptions] = useState({
    skipGitHubAnalysis: false,
    skipLlmSummary: false,
    regenerateSummaries: false,
    includeAchievements: true,
    includeTechStack: true,
  })
  const [summaryStyle, setSummaryStyle] = useState<string>('professional')

  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
  })

  const runPipelineMutation = useMutation({
    mutationFn: (data: PipelineRunRequest) => pipelineApi.run(user!.id, data),
    onSuccess: (response) => {
      setTaskId(response.data.task_id)
      toast({ title: '파이프라인이 시작되었습니다.' })
      navigate('/generate/pipeline')
    },
    onError: () => toast({ title: '오류', description: '파이프라인 실행에 실패했습니다.', variant: 'destructive' }),
  })

  const projects = projectsData?.data?.projects || []
  const templates = templatesData?.data?.templates || []

  const handleProjectToggle = (projectId: number) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    )
  }

  const handleSelectAll = () => {
    if (selectedProjects.length === projects.length) {
      setSelectedProjects([])
    } else {
      setSelectedProjects(projects.map((p) => p.id))
    }
  }

  const handleSubmit = () => {
    if (selectedProjects.length === 0) {
      toast({ title: '프로젝트 선택', description: '최소 1개의 프로젝트를 선택해주세요.', variant: 'destructive' })
      return
    }
    if (!templateId) {
      toast({ title: '템플릿 선택', description: '템플릿을 선택해주세요.', variant: 'destructive' })
      return
    }

    const request: PipelineRunRequest = {
      project_ids: selectedProjects,
      template_id: parseInt(templateId),
      output_format: outputFormat,
      document_name: documentName || undefined,
      skip_github_analysis: options.skipGitHubAnalysis,
      skip_llm_summary: options.skipLlmSummary,
      regenerate_summaries: options.regenerateSummaries,
      include_achievements: options.includeAchievements,
      include_tech_stack: options.includeTechStack,
      summary_style: summaryStyle,
    }

    setRequest(request)
    runPipelineMutation.mutate(request)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">문서 생성</h1>
        <p className="text-gray-600">프로젝트를 선택하고 템플릿을 적용하여 이력서/포트폴리오를 생성합니다.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project Selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>프로젝트 선택</CardTitle>
                <CardDescription>문서에 포함할 프로젝트를 선택하세요.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedProjects.length === projects.length ? '전체 해제' : '전체 선택'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>등록된 프로젝트가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedProjects.includes(project.id)
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleProjectToggle(project.id)}
                  >
                    <Checkbox
                      checked={selectedProjects.includes(project.id)}
                      onCheckedChange={() => handleProjectToggle(project.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{project.name}</span>
                        {project.is_analyzed && <Badge variant="success" className="text-xs">분석됨</Badge>}
                        {project.ai_summary && <Badge variant="secondary" className="text-xs">AI 요약</Badge>}
                      </div>
                      {project.short_description && (
                        <p className="text-sm text-gray-500 truncate">{project.short_description}</p>
                      )}
                      {project.technologies?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {project.technologies.slice(0, 5).map((tech) => (
                            <Badge key={tech.id} variant="outline" className="text-xs">
                              {tech.name}
                            </Badge>
                          ))}
                          {project.technologies.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{project.technologies.length - 5}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-500 mt-4">
              {selectedProjects.length}개 프로젝트 선택됨
            </p>
          </CardContent>
        </Card>

        {/* Settings */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>템플릿 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>템플릿</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="템플릿 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>출력 형식</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Word (DOCX)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="md">Markdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>문서명 (선택)</Label>
                <Input
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="자동 생성"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>생성 옵션</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>요약 스타일</Label>
                <Select value={summaryStyle} onValueChange={setSummaryStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">전문적</SelectItem>
                    <SelectItem value="casual">친근한</SelectItem>
                    <SelectItem value="technical">기술 중심</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="includeAchievements"
                    checked={options.includeAchievements}
                    onCheckedChange={(c) => setOptions({ ...options, includeAchievements: !!c })}
                  />
                  <Label htmlFor="includeAchievements">성과 포함</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="includeTechStack"
                    checked={options.includeTechStack}
                    onCheckedChange={(c) => setOptions({ ...options, includeTechStack: !!c })}
                  />
                  <Label htmlFor="includeTechStack">기술 스택 포함</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="regenerateSummaries"
                    checked={options.regenerateSummaries}
                    onCheckedChange={(c) => setOptions({ ...options, regenerateSummaries: !!c })}
                  />
                  <Label htmlFor="regenerateSummaries">AI 요약 재생성</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="skipLlmSummary"
                    checked={options.skipLlmSummary}
                    onCheckedChange={(c) => setOptions({ ...options, skipLlmSummary: !!c })}
                  />
                  <Label htmlFor="skipLlmSummary">AI 요약 건너뛰기</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={runPipelineMutation.isPending || selectedProjects.length === 0 || !templateId}
          >
            <Play className="h-4 w-4 mr-2" />
            {runPipelineMutation.isPending ? '실행 중...' : '문서 생성 시작'}
          </Button>
        </div>
      </div>
    </div>
  )
}
