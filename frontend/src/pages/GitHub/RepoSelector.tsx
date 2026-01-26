import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { githubApi, GitHubRepo } from '@/api/github'
import {
  Github,
  Search,
  Star,
  GitFork,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Filter,
  X,
} from 'lucide-react'

export default function RepoSelector() {
  const navigate = useNavigate()
  const { t } = useTranslation('github')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, setUser } = useUserStore()

  // State
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState<string>('all')

  // Step 1: Check GitHub connection status FIRST
  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
  } = useQuery({
    queryKey: ['github-status', user?.id],
    queryFn: () => githubApi.getStatus(user!.id),
    enabled: !!user?.id,
    retry: 1,
    staleTime: 30000, // Cache for 30 seconds
  })

  const githubStatus = statusData?.data
  const isConnected = githubStatus?.connected === true
  const isValidToken = githubStatus?.valid === true
  const canFetchRepos = isConnected && isValidToken

  // Sync userStore with actual GitHub status
  useEffect(() => {
    if (githubStatus && user) {
      const needsUpdate =
        (githubStatus.connected && githubStatus.valid &&
          (user.github_username !== githubStatus.github_username ||
           user.github_avatar_url !== githubStatus.avatar_url)) ||
        (!githubStatus.connected && user.github_username)

      if (needsUpdate) {
        setUser({
          ...user,
          github_username: githubStatus.connected && githubStatus.valid ? githubStatus.github_username : null,
          github_avatar_url: githubStatus.connected && githubStatus.valid ? githubStatus.avatar_url : null,
        })
      }
    }
  }, [githubStatus, user, setUser])

  // Step 2: Only fetch repos if GitHub is connected AND token is valid
  const { data: reposData, isLoading: reposLoading, isError: reposError, refetch } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id && canFetchRepos,
    retry: 1,
  })

  const isLoading = statusLoading || (canFetchRepos && reposLoading)
  const isError = reposError // Only show error for repos fetch, not status

  const repos = reposData?.data?.repos || []
  const totalRepos = reposData?.data?.total || 0

  // Get unique languages for filter
  const languages = useMemo(() => {
    const langSet = new Set<string>()
    repos.forEach((repo) => {
      if (repo.language) langSet.add(repo.language)
    })
    return Array.from(langSet).sort()
  }, [repos])

  // Filtered repos
  const filteredRepos = useMemo(() => {
    return repos.filter((repo) => {
      const matchesSearch = searchQuery === '' ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesLanguage = languageFilter === 'all' || repo.language === languageFilter

      return matchesSearch && matchesLanguage
    })
  }, [repos, searchQuery, languageFilter])

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (repoUrls: string[]) =>
      githubApi.importRepos(user!.id, repoUrls, false),
    onSuccess: (response) => {
      const { imported, failed, results } = response.data

      if (imported > 0) {
        toast({
          title: t('importSuccess'),
          description: failed > 0
            ? t('importSuccessWithFailed', { count: imported, failed })
            : t('importSuccessDesc', { count: imported }),
        })

        // Clear selection
        setSelectedRepos(new Set())

        // Invalidate projects query
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      } else {
        toast({
          title: t('importFailed'),
          description: results[0]?.message || t('importFailedDesc'),
          variant: 'destructive',
        })
      }
    },
    onError: (error: any) => {
      toast({
        title: t('errorTitle'),
        description: error?.response?.data?.detail || t('errorDesc'),
        variant: 'destructive',
      })
    },
  })

  // Handlers
  const toggleRepo = (cloneUrl: string) => {
    const newSelected = new Set(selectedRepos)
    if (newSelected.has(cloneUrl)) {
      newSelected.delete(cloneUrl)
    } else {
      newSelected.add(cloneUrl)
    }
    setSelectedRepos(newSelected)
  }

  const toggleAll = () => {
    if (selectedRepos.size === filteredRepos.length) {
      setSelectedRepos(new Set())
    } else {
      setSelectedRepos(new Set(filteredRepos.map((r) => r.clone_url)))
    }
  }

  const handleImport = () => {
    if (selectedRepos.size === 0) {
      toast({
        title: t('selectionRequired'),
        description: t('selectionRequiredDesc'),
        variant: 'destructive',
      })
      return
    }
    importMutation.mutate(Array.from(selectedRepos))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setLanguageFilter('all')
  }

  // Render: Loading state (checking GitHub status)
  if (statusLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">{t('checkingConnection')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render: Status check failed (API error)
  if (statusError) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('connectionCheckFailed')}</h2>
            <p className="text-gray-600 mb-4">
              {t('connectionCheckFailedDesc')}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['github-status'] })}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('retry')}
              </Button>
              <Button onClick={() => navigate('/setup/github')}>
                <Github className="mr-2 h-4 w-4" />
                {t('goToSetup')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render: Not connected
  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Github className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('connectionRequired')}</h2>
            <p className="text-gray-600 mb-4">
              {t('connectionRequiredDesc')}
            </p>
            <Button onClick={() => navigate('/setup/github')}>
              <Github className="mr-2 h-4 w-4" />
              {t('connectGitHub')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render: Connected but token invalid/expired
  if (isConnected && !isValidToken) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('reconnectionRequired')}</h2>
            <p className="text-gray-600 mb-4">
              {githubStatus?.message || t('reconnectionRequiredDesc')}
            </p>
            {githubStatus?.github_username && (
              <p className="text-sm text-gray-500 mb-4">
                {t('previousConnection')}: @{githubStatus.github_username}
              </p>
            )}
            <Button onClick={() => navigate('/setup/github')}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('reconnectGitHub')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render: Connected and valid - show repos
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-gray-600">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedRepos.size === 0 || importMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            {importMutation.isPending
              ? t('importing')
              : t('importSelected', { count: selectedRepos.size })
            }
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('searchRepos')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t('languageFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allLanguages')}</SelectItem>
                {languages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchQuery || languageFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                {t('clearFilters')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <span>{t('showingCount', { showing: filteredRepos.length, total: totalRepos })}</span>
          {selectedRepos.size > 0 && (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {t('selectedCount', { count: selectedRepos.size })}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {selectedRepos.size === filteredRepos.length ? t('deselectAll') : t('selectAll')}
        </Button>
      </div>

      {/* Repo List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">{t('loadingRepos')}</p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">{t('loadError')}</p>
            <Button variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      ) : filteredRepos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Github className="h-8 w-8 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {repos.length === 0 ? t('noRepos') : t('noMatchingRepos')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredRepos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              selected={selectedRepos.has(repo.clone_url)}
              onToggle={() => toggleRepo(repo.clone_url)}
            />
          ))}
        </div>
      )}

      {/* Action Footer */}
      {selectedRepos.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="py-3 px-6 flex items-center gap-4">
              <span className="text-sm font-medium">
                {t('reposSelected', { count: selectedRepos.size })}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedRepos(new Set())}
              >
                {t('cancelSelection')}
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importMutation.isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('importAsProjects')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// Repo Card Component
interface RepoCardProps {
  repo: GitHubRepo
  selected: boolean
  onToggle: () => void
}

function RepoCard({ repo, selected, onToggle }: RepoCardProps) {
  const { t } = useTranslation('github')
  const { i18n } = useTranslation()

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-gray-50 ${
        selected ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
      onClick={onToggle}
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{repo.name}</h3>
              {repo.language && (
                <Badge variant="outline" className="text-xs">
                  {repo.language}
                </Badge>
              )}
            </div>

            {repo.description && (
              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                {repo.description}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {repo.stargazers_count}
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="h-3 w-3" />
                {repo.forks_count}
              </span>
              <span>
                {t('updated')} {formatDate(repo.updated_at)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
