import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/api/users'
import { projectsApi } from '@/api/knowledge'
import { documentsApi } from '@/api/documents'
import { pipelineApi } from '@/api/pipeline'
import {
  Building2,
  FolderKanban,
  FileText,
  Github,
  ArrowRight,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react'

export default function Dashboard() {
  const { t } = useTranslation()
  const { user, setStats } = useUserStore()

  // Fetch user stats
  const { data: stats } = useQuery({
    queryKey: ['user-stats', user?.id],
    queryFn: () => usersApi.getStats(user!.id),
    enabled: !!user?.id,
    // Refetch on mount to ensure we have latest GitHub connection status
    refetchOnMount: true,
    staleTime: 0,
  })

  // Fetch recent projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id, { limit: 5 }),
    enabled: !!user?.id,
  })

  // Fetch recent documents
  const { data: documentsData } = useQuery({
    queryKey: ['documents', user?.id],
    queryFn: () => documentsApi.getAll(user!.id, { limit: 5 }),
    enabled: !!user?.id,
  })

  // Fetch recent jobs
  const { data: jobsData } = useQuery({
    queryKey: ['jobs', user?.id],
    queryFn: () => pipelineApi.getJobs(user!.id, { limit: 5 }),
    enabled: !!user?.id,
  })

  useEffect(() => {
    if (stats?.data) {
      setStats(stats.data)
    }
  }, [stats, setStats])

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-3xl font-bold mb-4">{t('dashboard:welcome')}</h1>
        <p className="text-muted-foreground mb-8 max-w-md">
          {t('dashboard:welcomeDesc')}
        </p>
        <Link to="/setup">
          <Button size="lg">
            {t('dashboard:getStarted')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    )
  }

  const statsCards = [
    {
      title: t('dashboard:stats.companies'),
      value: stats?.data?.companies_count || 0,
      icon: Building2,
      href: '/knowledge/companies',
      color: 'text-blue-500',
    },
    {
      title: t('dashboard:stats.projects'),
      value: stats?.data?.projects_count || 0,
      icon: FolderKanban,
      href: '/knowledge/projects',
      color: 'text-green-500',
    },
    {
      title: t('dashboard:stats.analyzedProjects'),
      value: stats?.data?.analyzed_projects_count || 0,
      icon: Github,
      href: '/knowledge/projects?analyzed=true',
      color: 'text-purple-500',
    },
    {
      title: t('dashboard:stats.documents'),
      value: stats?.data?.documents_count || 0,
      icon: FileText,
      href: '/documents',
      color: 'text-orange-500',
    },
  ]

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />{t('dashboard:jobStatus.completed')}</Badge>
      case 'running':
        return <Badge variant="default"><Clock className="h-3 w-3 mr-1" />{t('dashboard:jobStatus.running')}</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('dashboard:jobStatus.failed')}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('dashboard:hello', { name: user.name || 'User' })}</h1>
          <p className="text-muted-foreground">{t('dashboard:manageAndGenerate')}</p>
        </div>
        <Link to="/generate">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('dashboard:generateDocument')}
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-3xl font-bold">{card.value}</p>
                  </div>
                  <card.icon className={`h-10 w-10 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('dashboard:recentProjects')}</CardTitle>
              <Link to="/knowledge/projects">
                <Button variant="ghost" size="sm">
                  {t('dashboard:viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {projectsData?.data?.projects?.length ? (
              <div className="space-y-3">
                {projectsData.data.projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    to={`/knowledge/projects/${project.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{project.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {project.short_description || project.description}
                      </p>
                    </div>
                    {project.is_analyzed && (
                      <Badge variant="success" className="ml-2">{t('projects:analyzed')}</Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('dashboard:noProjects')}</p>
                <Link to="/knowledge/projects">
                  <Button variant="link" className="mt-2">
                    {t('dashboard:addProject')}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('dashboard:recentDocuments')}</CardTitle>
              <Link to="/documents">
                <Button variant="ghost" size="sm">
                  {t('dashboard:viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {documentsData?.data?.documents?.length ? (
              <div className="space-y-3">
                {documentsData.data.documents.slice(0, 5).map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{doc.document_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{doc.file_format?.toUpperCase()}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('dashboard:noDocuments')}</p>
                <Link to="/generate">
                  <Button variant="link" className="mt-2">
                    {t('dashboard:createFirstDocument')}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('dashboard:recentJobs')}</CardTitle>
              <Link to="/history">
                <Button variant="ghost" size="sm">
                  {t('dashboard:viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {jobsData?.data?.jobs?.length ? (
              <div className="space-y-3">
                {jobsData.data.jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {job.job_type === 'pipeline' ? t('dashboard:pipelineJob') : job.job_type}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {job.status === 'running' && (
                        <span className="text-sm text-muted-foreground">
                          {job.progress}% ({job.step_name})
                        </span>
                      )}
                      {getJobStatusBadge(job.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('dashboard:noJobs')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {!stats?.data?.github_connected && (
        <Card className="bg-gradient-to-r from-gray-900 to-gray-800 text-white dark:from-gray-800 dark:to-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Github className="h-10 w-10" />
                <div>
                  <h3 className="text-lg font-semibold">{t('dashboard:connectGitHub.title')}</h3>
                  <p className="text-gray-300">
                    {t('dashboard:connectGitHub.description')}
                  </p>
                </div>
              </div>
              <Link to="/setup/github">
                <Button variant="secondary">
                  {t('dashboard:connectGitHub.button')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
