import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUserStore } from '@/stores/userStore'
import { companiesApi, CompanySummaryResponse } from '@/api/knowledge'
import { formatDate } from '@/lib/utils'
import {
  Building2,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Users,
  Calendar,
  Code,
} from 'lucide-react'

function TechCategoryBadges({ techCategories }: { techCategories: Record<string, string[]> }) {
  const categoryColors: Record<string, string> = {
    Backend: 'bg-green-100 text-green-800',
    Frontend: 'bg-blue-100 text-blue-800',
    Mobile: 'bg-purple-100 text-purple-800',
    Database: 'bg-orange-100 text-orange-800',
    'DevOps/Infra': 'bg-gray-100 text-gray-800',
    'AI/ML': 'bg-pink-100 text-pink-800',
    Other: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className="space-y-2">
      {Object.entries(techCategories).map(([category, techs]) => (
        <div key={category} className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-gray-500 w-20">{category}:</span>
          {techs.map((tech) => (
            <Badge
              key={tech}
              variant="outline"
              className={`text-xs ${categoryColors[category] || 'bg-gray-100 text-gray-800'}`}
            >
              {tech}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  )
}

function CompanyCard({ companySummary }: { companySummary: CompanySummaryResponse }) {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(true)
  const { company, projects, project_count, tech_categories, date_range } = companySummary

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{company.name}</CardTitle>
                {company.is_current && <Badge variant="success">재직중</Badge>}
              </div>
              {company.position && (
                <p className="text-gray-700 font-medium mt-1">{company.position}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {date_range}
                </span>
                <span className="flex items-center gap-1">
                  <FolderGit2 className="h-4 w-4" />
                  {project_count}개 프로젝트
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Tech Stack Summary */}
          {Object.keys(tech_categories).length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Code className="h-4 w-4" />
                담당 기술 스택
              </h4>
              <TechCategoryBadges techCategories={tech_categories} />
            </div>
          )}

          {/* Projects List */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FolderGit2 className="h-4 w-4" />
              주요 프로젝트
            </h4>
            {projects.map((project, index) => (
              <div
                key={project.id}
                className="border-l-2 border-primary/30 pl-4 ml-2 py-2 hover:bg-gray-50 cursor-pointer rounded-r"
                onClick={() => navigate(`/knowledge/projects/${project.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {index + 1}
                      </span>
                      <h5 className="font-medium text-gray-900">{project.name}</h5>
                      {project.git_url && (
                        <a
                          href={project.git_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span>
                        {formatDate(project.start_date)} ~ {formatDate(project.end_date) || '진행중'}
                      </span>
                      {project.team_size && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {project.team_size}명
                        </span>
                      )}
                      {project.role && <span>| {project.role}</span>}
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    {project.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {project.technologies.slice(0, 8).map((tech) => (
                          <Badge key={tech} variant="secondary" className="text-xs">
                            {tech}
                          </Badge>
                        ))}
                        {project.technologies.length > 8 && (
                          <Badge variant="outline" className="text-xs">
                            +{project.technologies.length - 8}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-gray-500 italic">등록된 프로젝트가 없습니다.</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function CompanyTimelinePage() {
  const navigate = useNavigate()
  const { user } = useUserStore()
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline')

  const { data: groupedData, isLoading } = useQuery({
    queryKey: ['companies-grouped', user?.id],
    queryFn: () => companiesApi.getGroupedByCompany(user!.id),
    enabled: !!user?.id,
  })

  const companySummaries = groupedData?.data?.companies || []
  const totalCompanies = groupedData?.data?.total_companies || 0
  const totalProjects = groupedData?.data?.total_projects || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/knowledge/companies')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            돌아가기
          </Button>
          <div>
            <h1 className="text-3xl font-bold">회사별 타임라인</h1>
            <p className="text-gray-600">
              회사별로 프로젝트와 기술 스택을 한눈에 확인합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalCompanies}</p>
                <p className="text-sm text-gray-500">총 회사</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FolderGit2 className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalProjects}</p>
                <p className="text-sm text-gray-500">총 프로젝트</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Code className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(
                    companySummaries.flatMap((cs) => cs.aggregated_tech_stack)
                  ).size}
                </p>
                <p className="text-sm text-gray-500">총 기술 스택</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'timeline' | 'list')}>
        <TabsList>
          <TabsTrigger value="timeline">타임라인 뷰</TabsTrigger>
          <TabsTrigger value="list">리스트 뷰</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-6">
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : companySummaries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  등록된 회사가 없습니다
                </h3>
                <p className="text-gray-500 mb-4">먼저 회사를 추가해주세요.</p>
                <Button onClick={() => navigate('/knowledge/companies')}>
                  회사 추가하기
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

              {/* Company cards */}
              <div className="space-y-0 pl-12">
                {companySummaries.map((summary) => (
                  <CompanyCard key={summary.company.id} companySummary={summary} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : (
            <div className="space-y-4">
              {companySummaries.map((summary) => (
                <Card key={summary.company.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="font-medium">{summary.company.name}</h3>
                          <p className="text-sm text-gray-500">
                            {summary.date_range} | {summary.project_count}개 프로젝트
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {summary.aggregated_tech_stack.slice(0, 6).map((tech) => (
                          <Badge key={tech} variant="outline" className="text-xs">
                            {tech}
                          </Badge>
                        ))}
                        {summary.aggregated_tech_stack.length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{summary.aggregated_tech_stack.length - 6}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
