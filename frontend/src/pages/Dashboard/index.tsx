import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/api/users'
import { companiesApi } from '@/api/knowledge'
import { githubApi } from '@/api/github'
import {
  certificationsApi,
  awardsApi,
  educationsApi,
  publicationsApi,
  volunteerActivitiesApi,
} from '@/api/credentials'
import {
  Building2,
  FolderKanban,
  FileText,
  Github,
  ArrowRight,
  Plus,
  Crown,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { usePlanStore } from '@/stores/planStore'
import { USER_TIERS } from '@/constants/enums'
import { isElectron } from '@/lib/electron'
import CareerTimeline from './CareerTimeline'
import GitHubRepoTimeline from './GitHubRepoTimeline'

export default function Dashboard() {
  const { t } = useTranslation()
  const { user, setStats } = useUserStore()

  const { data: stats } = useQuery({
    queryKey: ['user-stats', user?.id],
    queryFn: () => usersApi.getStats(user!.id),
    enabled: !!user?.id,
    refetchOnMount: true,
    staleTime: 0,
  })

  const { data: groupedData, isLoading: groupedLoading } = useQuery({
    queryKey: ['companies-grouped', user?.id],
    queryFn: () => companiesApi.getGroupedByCompany(user!.id),
    enabled: !!user?.id,
  })

  const { data: reposData, isLoading: reposLoading } = useQuery({
    queryKey: ['github-repos-timeline', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id && stats?.data?.github_connected === true,
  })

  // Credential queries for career timeline
  const { data: certsData } = useQuery({
    queryKey: ['certifications', user?.id],
    queryFn: () => certificationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })
  const { data: awardsData } = useQuery({
    queryKey: ['awards', user?.id],
    queryFn: () => awardsApi.getAll(user!.id),
    enabled: !!user?.id,
  })
  const { data: eduData } = useQuery({
    queryKey: ['educations', user?.id],
    queryFn: () => educationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })
  const { data: pubsData } = useQuery({
    queryKey: ['publications', user?.id],
    queryFn: () => publicationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })
  const { data: volData } = useQuery({
    queryKey: ['volunteer-activities', user?.id],
    queryFn: () => volunteerActivitiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const credentialData = {
    certifications: certsData?.data || [],
    awards: awardsData?.data || [],
    educations: eduData?.data || [],
    publications: pubsData?.data || [],
    volunteerActivities: volData?.data || [],
  }

  const { tier, limits, usage: planUsage, fetchPlan } = usePlanStore()

  useEffect(() => {
    if (stats?.data) {
      setStats(stats.data)
    }
  }, [stats, setStats])

  // Fetch plan/usage data
  useEffect(() => {
    if (user?.id && !isElectron()) {
      fetchPlan(user.id)
    }
  }, [user?.id, fetchPlan])

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

  return (
    <div className="space-y-6">
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

      {/* Plan Usage Widget (web only) */}
      {!isElectron() && limits && planUsage && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                <span className="font-medium">{t('common:plan.currentPlan')}</span>
                <Badge variant={tier === USER_TIERS.FREE ? 'secondary' : 'default'}>
                  {t(`common:plan.${tier}`)}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {limits.max_projects !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common:plan.projectLimit', { current: planUsage.projects, max: limits.max_projects })}</span>
                  </div>
                  <Progress value={(planUsage.projects / limits.max_projects) * 100} className="h-2" />
                </div>
              )}
              {limits.max_llm_calls_per_month !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common:plan.llmLimit', { current: planUsage.llm_calls_this_month, max: limits.max_llm_calls_per_month })}</span>
                  </div>
                  <Progress value={(planUsage.llm_calls_this_month / limits.max_llm_calls_per_month) * 100} className="h-2" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Career Timeline (includes projects) */}
      <CareerTimeline data={groupedData?.data} credentials={credentialData} isLoading={groupedLoading} />

      {/* GitHub Repo Timeline */}
      <GitHubRepoTimeline
        repos={reposData?.data?.repos}
        isConnected={stats?.data?.github_connected}
        isLoading={reposLoading}
        githubUsername={user?.github_username || undefined}
      />

      {/* GitHub Connect Banner (only when not connected) */}
      {stats?.data && !stats.data.github_connected && (
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
