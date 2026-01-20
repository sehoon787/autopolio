import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { projectsApi } from '@/api/knowledge'
import { githubApi } from '@/api/github'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Github,
  ExternalLink,
  RefreshCw,
  Trophy,
  Code,
  GitCommit,
} from 'lucide-react'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  const projectId = parseInt(id || '0')

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getById(projectId),
    enabled: !!projectId,
  })

  const { data: analysisData } = useQuery({
    queryKey: ['repo-analysis', projectId],
    queryFn: () => githubApi.getAnalysis(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  const analyzeMutation = useMutation({
    mutationFn: () => githubApi.analyzeRepo(user!.id, project!.git_url!, project!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['repo-analysis', projectId] })
      toast({ title: '분석 완료', description: '레포지토리 분석이 완료되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '분석에 실패했습니다.', variant: 'destructive' }),
  })

  const project = projectData?.data
  const analysis = analysisData?.data

  if (isLoading) {
    return <div className="text-center py-8">로딩 중...</div>
  }

  if (!project) {
    return <div className="text-center py-8">프로젝트를 찾을 수 없습니다.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.is_analyzed && <Badge variant="success">분석됨</Badge>}
          </div>
          {project.short_description && (
            <p className="text-gray-600 mt-1">{project.short_description}</p>
          )}
        </div>
        {project.git_url && (
          <Button
            variant="outline"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
            {project.is_analyzed ? '재분석' : '레포 분석'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">기본 정보</TabsTrigger>
          <TabsTrigger value="achievements">성과</TabsTrigger>
          {project.is_analyzed && <TabsTrigger value="analysis">분석 결과</TabsTrigger>}
          {project.ai_summary && <TabsTrigger value="ai">AI 요약</TabsTrigger>}
        </TabsList>

        <TabsContent value="info">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>프로젝트 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">기간</span>
                  <p>
                    {formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : '진행중'}
                  </p>
                </div>
                {project.role && (
                  <div>
                    <span className="text-sm text-gray-500">역할</span>
                    <p>{project.role}</p>
                  </div>
                )}
                {project.team_size && (
                  <div>
                    <span className="text-sm text-gray-500">팀 규모</span>
                    <p>{project.team_size}명</p>
                  </div>
                )}
                {project.contribution_percent && (
                  <div>
                    <span className="text-sm text-gray-500">기여도</span>
                    <p>{project.contribution_percent}%</p>
                  </div>
                )}
                {project.git_url && (
                  <div>
                    <span className="text-sm text-gray-500">GitHub</span>
                    <a
                      href={project.git_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Github className="h-4 w-4" />
                      {project.git_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>기술 스택</CardTitle>
              </CardHeader>
              <CardContent>
                {project.technologies?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {project.technologies.map((tech) => (
                      <Badge key={tech.id} variant="secondary" className="text-sm">
                        {tech.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">등록된 기술 스택이 없습니다.</p>
                )}
              </CardContent>
            </Card>

            {project.description && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>상세 설명</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{project.description}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="achievements">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                프로젝트 성과
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.achievements?.length > 0 ? (
                <div className="space-y-4">
                  {project.achievements.map((achievement) => (
                    <div key={achievement.id} className="border-l-4 border-primary pl-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{achievement.metric_name}</span>
                        {achievement.metric_value && (
                          <Badge variant="success">{achievement.metric_value}</Badge>
                        )}
                      </div>
                      {achievement.description && (
                        <p className="text-gray-600 mt-1">{achievement.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">등록된 성과가 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {project.is_analyzed && analysis && (
          <TabsContent value="analysis">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitCommit className="h-5 w-5" />
                    커밋 통계
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-500">총 커밋</span>
                      <p className="text-2xl font-bold">{analysis.total_commits}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">내 커밋</span>
                      <p className="text-2xl font-bold">{analysis.user_commits}</p>
                    </div>
                  </div>
                  {analysis.commit_categories && (
                    <div>
                      <span className="text-sm text-gray-500">커밋 분류</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(analysis.commit_categories).map(([category, count]) => (
                          <Badge key={category} variant="outline">
                            {category}: {count as number}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    탐지된 기술
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysis.detected_technologies?.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {analysis.detected_technologies.map((tech) => (
                        <Badge key={tech} variant="secondary">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">탐지된 기술이 없습니다.</p>
                  )}
                  {analysis.languages && Object.keys(analysis.languages).length > 0 && (
                    <div className="mt-4">
                      <span className="text-sm text-gray-500">언어 비율</span>
                      <div className="space-y-2 mt-2">
                        {Object.entries(analysis.languages)
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .slice(0, 5)
                          .map(([lang, percent]) => (
                            <div key={lang} className="flex items-center gap-2">
                              <span className="w-24 text-sm">{lang}</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-primary rounded-full h-2"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-500 w-12 text-right">
                                {(percent as number).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {analysis.commit_messages_summary && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>커밋 메시지 요약</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                      {analysis.commit_messages_summary}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}

        {project.ai_summary && (
          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <CardTitle>AI 생성 요약</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">요약</span>
                  <p className="mt-1">{project.ai_summary}</p>
                </div>
                {project.ai_key_features && project.ai_key_features.length > 0 && (
                  <div>
                    <span className="text-sm text-gray-500">주요 기능</span>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      {project.ai_key_features.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
