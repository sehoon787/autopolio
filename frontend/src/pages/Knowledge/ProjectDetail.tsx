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
import { reportsApi, type DetailedReportData, type FinalReportData, type PerformanceSummaryData } from '@/api/documents'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Github,
  ExternalLink,
  RefreshCw,
  Trophy,
  Code,
  GitCommit,
  FileText,
  BarChart3,
  ClipboardList,
  Sparkles,
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

  // Fetch report data for tabs
  const { data: summaryReport } = useQuery({
    queryKey: ['report-summary', projectId],
    queryFn: () => reportsApi.getPerformanceSummary(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

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

  const analyzeMutation = useMutation({
    mutationFn: () => githubApi.analyzeRepo(user!.id, project!.git_url!, project!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['repo-analysis', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })
      toast({ title: '분석 완료', description: '레포지토리 분석이 완료되었습니다.' })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || '분석에 실패했습니다. 잠시 후 다시 시도해주세요.'
      toast({
        title: '분석 오류',
        description: errorMessage,
        variant: 'destructive'
      })
    },
  })

  const project = projectData?.data
  const analysis = analysisData?.data
  const summary = summaryReport?.data as PerformanceSummaryData | undefined
  const final = finalReport?.data as FinalReportData | undefined
  const detailed = detailedReport?.data as DetailedReportData | undefined

  if (isLoading) {
    return <div className="text-center py-8">로딩 중...</div>
  }

  if (!project) {
    return <div className="text-center py-8">프로젝트를 찾을 수 없습니다.</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* 3-Tab Structure */}
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            기본정보
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            분석 요약
          </TabsTrigger>
          <TabsTrigger value="detail" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            상세 분석
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 기본정보 (PROJECT_PERFORMANCE_SUMMARY style) */}
        <TabsContent value="basic" className="mt-6 space-y-6">
          <BasicInfoTab project={project} analysis={analysis} summary={summary} />
        </TabsContent>

        {/* Tab 2: 분석 요약 (FINAL_PROJECT_REPORT style) */}
        <TabsContent value="summary" className="mt-6 space-y-6">
          <SummaryTab project={project} analysis={analysis} final={final} />
        </TabsContent>

        {/* Tab 3: 상세 분석 (DETAILED_COMPLETION_REPORT style) */}
        <TabsContent value="detail" className="mt-6 space-y-6">
          <DetailTab project={project} analysis={analysis} detailed={detailed} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Tab 1: 기본정보
interface BasicInfoTabProps {
  project: any
  analysis: any
  summary: PerformanceSummaryData | undefined
}

function BasicInfoTab({ project, analysis, summary }: BasicInfoTabProps) {
  return (
    <>
      {/* 프로젝트 정보 & 기술 스택 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              프로젝트 정보
            </CardTitle>
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
            {project.git_url && (
              <div>
                <span className="text-sm text-gray-500">GitHub</span>
                <a
                  href={project.git_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  <Github className="h-4 w-4" />
                  {project.git_url.replace('https://github.com/', '')}
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
                {project.technologies.map((tech: any) => (
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
      </div>

      {/* 주요 수행 업무 (신규) */}
      {(summary?.key_tasks?.length || analysis?.key_tasks?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              주요 수행 업무
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(summary?.key_tasks || analysis?.key_tasks || []).map((task: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-500 font-medium">({index + 1})</span>
                  <span>{task}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* 성과 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            성과
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.achievements?.length > 0 ? (
            <div className="space-y-4">
              {project.achievements.map((achievement: any) => (
                <div key={achievement.id} className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-100">
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 rounded-full p-2 mt-0.5">
                      <Trophy className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{achievement.metric_name}</h4>
                      {achievement.description && (
                        <p className="text-gray-600 mt-1 text-sm">{achievement.description}</p>
                      )}
                      {achievement.metric_value && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-amber-600 font-medium">▶</span>
                          <span className="text-lg font-bold text-amber-700">{achievement.metric_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Trophy className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>등록된 성과가 없습니다.</p>
              <p className="text-sm mt-1">프로젝트를 분석하면 성과가 자동으로 감지됩니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 커밋/코드 통계 */}
      {project.is_analyzed && analysis && (
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
                <div className="bg-blue-50 rounded-lg p-3">
                  <span className="text-sm text-blue-600">총 커밋</span>
                  <p className="text-2xl font-bold text-blue-700">{analysis.total_commits}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <span className="text-sm text-green-600">내 커밋</span>
                  <p className="text-2xl font-bold text-green-700">{analysis.user_commits}</p>
                </div>
              </div>
              {analysis.total_commits > 0 && analysis.user_commits > 0 && (
                <div className="text-sm text-gray-600">
                  기여도: <span className="font-semibold">{((analysis.user_commits / analysis.total_commits) * 100).toFixed(1)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                코드 통계
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-emerald-600">추가</span>
                  <p className="text-lg font-bold text-emerald-700">+{analysis.lines_added?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-red-600">삭제</span>
                  <p className="text-lg font-bold text-red-700">-{analysis.lines_deleted?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-purple-600">파일</span>
                  <p className="text-lg font-bold text-purple-700">{analysis.files_changed?.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Not Analyzed State */}
      {!project.is_analyzed && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Code className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">아직 분석되지 않았습니다</h3>
            <p className="text-gray-500 mb-4 text-center">
              {project.git_url
                ? 'GitHub 레포지토리를 분석하여 커밋 통계, 코드 통계, 기술 스택 등을 확인하세요.'
                : 'GitHub URL을 등록하면 분석을 진행할 수 있습니다.'}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}

// Tab 2: 분석 요약
interface SummaryTabProps {
  project: any
  analysis: any
  final: FinalReportData | undefined
}

function SummaryTab({ project, analysis, final }: SummaryTabProps) {
  if (!project.is_analyzed || !analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">분석 데이터가 없습니다</h3>
          <p className="text-gray-500 text-center">프로젝트를 분석한 후 분석 요약을 확인할 수 있습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* 프로젝트 개요 */}
      <Card>
        <CardHeader>
          <CardTitle>프로젝트 개요</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">기간:</span>{' '}
              <span className="font-medium">{final?.overview?.date_range || formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : '진행중'}</span>
            </div>
            <div>
              <span className="text-gray-500">소속:</span>{' '}
              <span className="font-medium">{final?.overview?.company || '개인/프리랜서'}</span>
            </div>
            <div>
              <span className="text-gray-500">역할:</span>{' '}
              <span className="font-medium">{final?.overview?.role || project.role || '개발자'}</span>
            </div>
            {(project.team_size || final?.overview?.team_size) && (
              <div>
                <span className="text-gray-500">팀 규모:</span>{' '}
                <span className="font-medium">{final?.overview?.team_size || project.team_size}명</span>
              </div>
            )}
          </div>
          <div className="pt-2">
            <span className="text-gray-500 text-sm">기술 스택:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {(final?.technologies || project.technologies?.map((t: any) => t.name) || []).map((tech: string) => (
                <Badge key={tech} variant="outline" className="text-xs">
                  {tech}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 주요 구현 내용 */}
      {(final?.key_implementations?.length || analysis?.key_tasks?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>주요 구현 내용</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(final?.key_implementations || analysis?.key_tasks || []).map((item: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* 기술 스택 (버전 포함) - 상세 분석에서 가져옴 */}
      {analysis?.tech_stack_versions && Object.keys(analysis.tech_stack_versions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-green-500" />
              기술 스택 (버전)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(analysis.tech_stack_versions as Record<string, string[]>).map(([category, techs]) => (
              <div key={category}>
                <p className="font-medium text-sm text-gray-500 mb-1">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {techs.map((tech: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 성과 */}
      {(final?.achievements?.length || project.achievements?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>성과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(final?.achievements || project.achievements || []).map((ach: any, index: number) => (
              <div key={index} className="border-l-4 border-amber-400 pl-4 py-2">
                <div className="font-semibold text-gray-900">[ {ach.metric_name} ]</div>
                {ach.description && <p className="text-sm text-gray-600 mt-1">{ach.description}</p>}
                {ach.metric_value && (
                  <div className="text-amber-600 font-medium mt-1">▶ {ach.metric_value}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* 코드 기여도 */}
      {(final?.code_contribution || analysis) && (
        <Card>
          <CardHeader>
            <CardTitle>코드 기여도</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="text-emerald-600 text-sm">추가된 코드</div>
                <div className="text-xl font-bold text-emerald-700">
                  +{(final?.code_contribution?.lines_added || analysis?.lines_added || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-red-600 text-sm">삭제된 코드</div>
                <div className="text-xl font-bold text-red-700">
                  -{(final?.code_contribution?.lines_deleted || analysis?.lines_deleted || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-blue-600 text-sm">커밋 수</div>
                <div className="text-xl font-bold text-blue-700">
                  {(final?.code_contribution?.commits || analysis?.user_commits || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-purple-600 text-sm">기여도</div>
                <div className="text-xl font-bold text-purple-700">
                  {(final?.code_contribution?.contribution_percent ||
                    (analysis?.total_commits > 0 ? ((analysis?.user_commits / analysis?.total_commits) * 100).toFixed(1) : 0))}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 요약 */}
      {(project.ai_summary || final?.ai_summary?.summary) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI 요약
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{final?.ai_summary?.summary || project.ai_summary}</p>
            {(final?.ai_summary?.key_features?.length || project.ai_key_features?.length) ? (
              <div>
                <span className="text-sm text-gray-500">주요 기능</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {(final?.ai_summary?.key_features || project.ai_key_features || []).map((feature: string, index: number) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )
}

// Tab 3: 상세 분석
interface DetailTabProps {
  project: any
  analysis: any
  detailed: DetailedReportData | undefined
}

function DetailTab({ project, analysis, detailed }: DetailTabProps) {
  if (!project.is_analyzed || !analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">분석 데이터가 없습니다</h3>
          <p className="text-gray-500 text-center">프로젝트를 분석한 후 상세 분석을 확인할 수 있습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* 주요 구현 기능 (LLM-generated) */}
      {detailed?.implementation_details && detailed.implementation_details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              주요 구현 기능
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {detailed.implementation_details.map((feature, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="font-semibold text-lg text-gray-900">
                  {idx + 1}. {feature.title}
                </h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                  {feature.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-sm">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 개발 타임라인 (LLM-generated) */}
      {detailed?.development_timeline && detailed.development_timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-blue-500" />
              개발 타임라인
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailed.development_timeline.map((phase, idx) => (
              <div key={idx} className="border-l-2 border-blue-400 pl-4 pb-4 last:pb-0">
                <p className="font-semibold text-blue-600 text-sm">{phase.period}</p>
                <p className="font-medium text-gray-900 mt-1">{phase.title}</p>
                <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                  {phase.activities.map((activity, actIdx) => (
                    <li key={actIdx}>{activity}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 기술 스택 (버전 포함) */}
      {detailed?.tech_stack_versions && Object.keys(detailed.tech_stack_versions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-green-500" />
              기술 스택 (버전 포함)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(detailed.tech_stack_versions).map(([category, techs]) => (
              <div key={category}>
                <p className="font-medium text-sm text-gray-500 mb-2">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {techs.map((tech, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 상세 성과 (카테고리별, LLM-generated) */}
      {detailed?.detailed_achievements && Object.keys(detailed.detailed_achievements).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              주요 성과 (카테고리별)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(detailed.detailed_achievements).map(([category, achievements]) => (
              achievements.length > 0 && (
                <div key={category}>
                  <h4 className="font-semibold text-primary mb-2">{category}</h4>
                  <div className="space-y-2 ml-4">
                    {achievements.map((ach, idx) => (
                      <div key={idx} className="border-l-2 border-amber-300 pl-3">
                        <p className="font-medium text-gray-900">{ach.title}</p>
                        <p className="text-sm text-gray-600">{ach.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </CardContent>
        </Card>
      )}

      {/* 저장소 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>저장소 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">저장소:</span>
            <span className="font-medium">{detailed?.repository?.name || project.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">GitHub:</span>
            <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              {project.git_url?.replace('https://github.com/', '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">총 커밋:</span>
            <span className="font-medium">{detailed?.repository?.total_commits || analysis.total_commits}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">코드 변경량:</span>
            <span className="font-medium">
              <span className="text-emerald-600">+{(detailed?.repository?.lines_added || analysis.lines_added || 0).toLocaleString()}</span>
              {' / '}
              <span className="text-red-600">-{(detailed?.repository?.lines_deleted || analysis.lines_deleted || 0).toLocaleString()}</span>
            </span>
          </div>
          {detailed?.repository?.analyzed_at && (
            <div className="flex justify-between">
              <span className="text-gray-500">분석 시간:</span>
              <span className="font-medium">{detailed.repository.analyzed_at}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 커밋 상세 분석 & 코드 상세 분석 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="h-5 w-5" />
              커밋 상세 분석
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">총 커밋</span>
                <span className="font-medium">{detailed?.commit_analysis?.total_commits || analysis.total_commits}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">내 커밋</span>
                <span className="font-medium">
                  {detailed?.commit_analysis?.user_commits || analysis.user_commits} ({detailed?.commit_analysis?.contribution_percent || ((analysis.user_commits / analysis.total_commits) * 100).toFixed(1)}%)
                </span>
              </div>
              {analysis.commit_categories && Object.keys(analysis.commit_categories).length > 0 && (
                <>
                  {Object.entries(analysis.commit_categories).map(([category, count]) => (
                    <div key={category} className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">{category}</span>
                      <span className="font-medium">{count as number}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              코드 상세 분석
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">추가된 라인</span>
                <span className="font-medium text-emerald-600">+{(detailed?.code_analysis?.lines_added || analysis.lines_added || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">삭제된 라인</span>
                <span className="font-medium text-red-600">-{(detailed?.code_analysis?.lines_deleted || analysis.lines_deleted || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">순 변경</span>
                <span className="font-medium text-blue-600">
                  {((detailed?.code_analysis?.net_change || (analysis.lines_added || 0) - (analysis.lines_deleted || 0)) > 0 ? '+' : '')}
                  {(detailed?.code_analysis?.net_change || (analysis.lines_added || 0) - (analysis.lines_deleted || 0)).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">변경된 파일</span>
                <span className="font-medium">{detailed?.code_analysis?.files_changed || analysis.files_changed || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 언어 분석 */}
      {analysis.languages && Object.keys(analysis.languages).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>언어 분석</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(detailed?.languages || Object.entries(analysis.languages)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 6)
                .map(([lang, percent]) => ({ name: lang, percent: percent as number })))
                .map((lang: any) => (
                  <div key={lang.name} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium">{lang.name}</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-full h-2.5"
                        style={{ width: `${lang.percent}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-14 text-right font-medium">
                      {lang.percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 아키텍처 패턴 */}
      {(detailed?.architecture_patterns?.length || analysis.architecture_patterns?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>탐지된 아키텍처 패턴</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(detailed?.architecture_patterns || analysis.architecture_patterns || []).map((pattern: string) => (
                <Badge key={pattern} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {pattern}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 커밋 메시지 요약 */}
      {(detailed?.commit_analysis?.messages_summary || analysis.commit_messages_summary) && (
        <Card>
          <CardHeader>
            <CardTitle>커밋 메시지 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border">
              {detailed?.commit_analysis?.messages_summary || analysis.commit_messages_summary}
            </pre>
          </CardContent>
        </Card>
      )}
    </>
  )
}
