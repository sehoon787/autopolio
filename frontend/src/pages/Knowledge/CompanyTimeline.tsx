import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
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
  return (
    <div className="space-y-2">
      {Object.entries(techCategories).map(([category, techs]) => (
        <div key={category} className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-gray-500 w-20">{category}:</span>
          {techs.map((tech) => (
            <TechBadge key={tech} tech={tech} size="sm" />
          ))}
        </div>
      ))}
    </div>
  )
}

function CompanyCard({ companySummary, t }: { companySummary: CompanySummaryResponse, t: (key: string, options?: any) => string }) {
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
                {company.is_current && <Badge variant="success">{t('current')}</Badge>}
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
                  {t('timeline.projectsCount', { count: project_count })}
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
                {t('timeline.techStack')}
              </h4>
              <TechCategoryBadges techCategories={tech_categories} />
            </div>
          )}

          {/* Projects List */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FolderGit2 className="h-4 w-4" />
              {t('timeline.keyProjects')}
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
                        {formatDate(project.start_date)} ~ {formatDate(project.end_date) || t('timeline.ongoing')}
                      </span>
                      {project.team_size && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {t('timeline.teamMembers', { count: project.team_size })}
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
                          <TechBadge key={tech} tech={tech} size="sm" />
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
              <p className="text-sm text-gray-500 italic">{t('timeline.noProjectsRegistered')}</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function CompanyTimelinePage() {
  const navigate = useNavigate()
  const { t } = useTranslation('companies')
  const { t: tc } = useTranslation('common')
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
            {t('timeline.goBack')}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{t('timeline.title')}</h1>
            <p className="text-gray-600">
              {t('timeline.subtitle')}
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
                <p className="text-sm text-gray-500">{t('timeline.totalCompanies')}</p>
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
                <p className="text-sm text-gray-500">{t('timeline.totalProjects')}</p>
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
                <p className="text-sm text-gray-500">{t('timeline.totalTechStack')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'timeline' | 'list')}>
        <TabsList>
          <TabsTrigger value="timeline">{t('timelineView')}</TabsTrigger>
          <TabsTrigger value="list">{t('timeline.listView')}</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-6">
          {isLoading ? (
            <div className="text-center py-8">{tc('loading')}</div>
          ) : companySummaries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {t('noCompanies')}
                </h3>
                <p className="text-gray-500 mb-4">{t('timeline.addCompanyFirst')}</p>
                <Button onClick={() => navigate('/knowledge/companies')}>
                  {t('timeline.addCompanyBtn')}
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
                  <CompanyCard key={summary.company.id} companySummary={summary} t={t} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          {isLoading ? (
            <div className="text-center py-8">{tc('loading')}</div>
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
                            {summary.date_range} | {t('timeline.projectsCount', { count: summary.project_count })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {summary.aggregated_tech_stack.slice(0, 6).map((tech) => (
                          <TechBadge key={tech} tech={tech} size="sm" />
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
