import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SelectableTile } from '@/components/ui/selectable-tile'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useSelection } from '@/hooks/useSelection'
import { githubApi, GitHubRepo } from '@/api/github'
import { projectsApi } from '@/api/knowledge'
import { isElectron } from '@/lib/electron'
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
  const selection = useSelection<string>()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')

  // Track Electron CLI auth state separately
  const [cliAuthStatus, setCliAuthStatus] = useState<{
    checked: boolean
    authenticated: boolean
    username: string | null
  }>({ checked: false, authenticated: false, username: null })

  // Step 1a: For Electron, check CLI auth status directly (no backend needed)
  useEffect(() => {
    if (!isElectron() || !window.electron) return

    const checkCLIAuth = async () => {
      try {
        const status = await window.electron!.getGitHubCLIStatus()
        setCliAuthStatus({
          checked: true,
          authenticated: status.authenticated,
          username: status.username,
        })
        console.log('[RepoSelector] CLI auth status:', status.authenticated, status.username)
      } catch (error) {
        console.error('[RepoSelector] Failed to check CLI auth:', error)
        setCliAuthStatus({ checked: true, authenticated: false, username: null })
      }
    }
    checkCLIAuth()
  }, [])

  // Step 1b: Check backend GitHub connection status (both Web and Electron)
  // In Electron, App.tsx syncGitHubCLI saves the token to the backend,
  // so we can also check backend status to know if token sync completed.
  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
  } = useQuery({
    queryKey: ['github-status', user?.id],
    queryFn: () => githubApi.getStatus(user!.id),
    enabled: !!user?.id,  // Check backend status for both Web and Electron
    retry: 1,
    staleTime: 30000,
  })

  // Determine connection status based on environment
  const githubStatus = statusData?.data
  const isConnectedWeb = githubStatus?.connected === true && githubStatus?.valid === true
  const isConnectedElectron = isElectron() && cliAuthStatus.authenticated
  const isConnected = isElectron() ? isConnectedElectron : isConnectedWeb
  const canFetchRepos = isConnected

  // Sync userStore with actual GitHub status (Web mode only)
  useEffect(() => {
    if (!isElectron() && githubStatus && user) {
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

  // Electron: sync CLI auth to backend (save token for API calls like import-repos)
  const [tokenSynced, setTokenSynced] = useState(false)
  
  useEffect(() => {
    if (!isElectron() || !cliAuthStatus.authenticated || !user?.id || tokenSynced) return

    const syncTokenToBackend = async () => {
      try {
        // Get token from gh CLI
        const tokenResult = await window.electron!.getGitHubToken()
        if (!tokenResult.success || !tokenResult.token) {
          console.warn('[RepoSelector] Failed to get GitHub token from CLI')
          return
        }

        // Save token to backend for API operations (import-repos, analyze, etc.)
        console.log('[RepoSelector] Syncing GitHub token to backend for user:', user.id)
        const saveResult = await githubApi.saveToken(user.id, tokenResult.token)
        
        // CRITICAL: Handle user_id from response
        const actualUserId = saveResult.data.user_id
        console.log('[RepoSelector] Token saved. Requested user:', user.id, 'Actual user:', actualUserId)
        
        if (actualUserId !== user.id) {
          // Token was saved to a different user (GitHub account already linked to another user)
          console.log('[RepoSelector] User merged! Updating userStore from', user.id, 'to', actualUserId)
          setUser({
            ...user,
            id: actualUserId,
            github_username: saveResult.data.github_username || cliAuthStatus.username,
            github_avatar_url: saveResult.data.github_avatar_url || null,
          })
        } else {
          // Update user store with CLI username if needed
          if (cliAuthStatus.username && user.github_username !== cliAuthStatus.username) {
            setUser({
              ...user,
              github_username: cliAuthStatus.username,
            })
          }
        }
        
        setTokenSynced(true)
        console.log('[RepoSelector] GitHub token synced successfully')
      } catch (error) {
        console.error('[RepoSelector] Failed to sync token to backend:', error)
        // Don't block - repos list still works via CLI, only import will fail
      }
    }

    syncTokenToBackend()
  }, [cliAuthStatus, user, tokenSynced, setUser])

  // Determine if backend has the GitHub token synced (Electron + Web)
  const isBackendTokenSynced = statusData?.data?.connected === true && statusData?.data?.valid === true

  // Step 2: Fetch repos
  // Priority: Use backend API when token is synced (consistent results for both Electron and Web)
  // Fallback: Use gh CLI directly in Electron if backend token not synced yet
  const { data: reposData, isLoading: reposLoading, isFetching: reposFetching, isError: reposError, refetch } = useQuery({
    queryKey: ['github-repos', user?.id, isBackendTokenSynced ? 'backend' : (isElectron() ? 'cli' : 'api')],
    queryFn: async () => {
      // If backend has the token, always use backend API (same results for Web + Electron)
      if (isBackendTokenSynced && user?.id) {
        console.log('[RepoSelector] Fetching repos via backend API (token synced)...')
        return githubApi.getRepos(user.id, true)
      }
      // Electron fallback: Use gh CLI directly if backend token not synced yet
      if (isElectron() && window.electron) {
        console.log('[RepoSelector] Fetching repos via gh CLI (token not yet synced)...')
        const result = await window.electron.listGitHubRepos()
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch repos via CLI')
        }
        return { data: { repos: result.repos, total: result.total, has_more: false } }
      }
      // Web: Use backend API (requires OAuth token)
      console.log('[RepoSelector] Fetching repos via backend API...')
      return githubApi.getRepos(user!.id, true)
    },
    enabled: canFetchRepos && (isElectron() ? cliAuthStatus.checked : !!user?.id),
    retry: 1,
  })

  // Step 3: Fetch existing projects to filter out already-added repos
  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  // Loading state: for Electron, check CLI status; for Web, check backend status
  const isCheckingAuth = isElectron() ? !cliAuthStatus.checked : statusLoading
  const isLoading = isCheckingAuth || (canFetchRepos && reposLoading)
  const isRefreshing = canFetchRepos && reposFetching && !reposLoading
  const isError = reposError

  // Virtual list scroll container ref
  const parentRef = useRef<HTMLDivElement>(null)

  // Note: CLI returns GitHubRepoFromCLI, API returns GitHubRepo - they have same structure
  const repos: GitHubRepo[] = (reposData?.data?.repos as GitHubRepo[]) || []
  const totalRepos = reposData?.data?.total || 0

  // Get set of already-added repo URLs (for filtering)
  const addedRepoUrls = useMemo(() => {
    const urls = new Set<string>()
    projectsData?.data?.projects?.forEach((p) => {
      if (p.git_url) {
        // Normalize URL: remove trailing .git and convert to lowercase
        const normalized = p.git_url.toLowerCase().replace(/\.git$/, '')
        urls.add(normalized)
      }
    })
    return urls
  }, [projectsData])

  // Get unique languages for filter
  const languages = useMemo(() => {
    const langSet = new Set<string>()
    repos.forEach((repo) => {
      if (repo.language) langSet.add(repo.language)
    })
    return Array.from(langSet).sort()
  }, [repos])

  // Count of repos already added as projects
  const alreadyAddedCount = useMemo(() => {
    return repos.filter((repo) => {
      const normalizedCloneUrl = repo.clone_url.toLowerCase().replace(/\.git$/, '')
      const normalizedHtmlUrl = repo.html_url.toLowerCase().replace(/\.git$/, '')
      return addedRepoUrls.has(normalizedCloneUrl) || addedRepoUrls.has(normalizedHtmlUrl)
    }).length
  }, [repos, addedRepoUrls])

  // Filtered repos (excluding already-added repos)
  const filteredRepos = useMemo(() => {
    const githubUsername = user?.github_username?.toLowerCase() || ''

    return repos.filter((repo) => {
      // Check if repo is already added as a project
      const normalizedCloneUrl = repo.clone_url.toLowerCase().replace(/\.git$/, '')
      const normalizedHtmlUrl = repo.html_url.toLowerCase().replace(/\.git$/, '')
      const isAlreadyAdded = addedRepoUrls.has(normalizedCloneUrl) || addedRepoUrls.has(normalizedHtmlUrl)
      if (isAlreadyAdded) return false

      const matchesSearch = searchQuery === '' ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesLanguage = languageFilter === 'all' || repo.language === languageFilter

      // Owner filter logic
      const isOwned = repo.owner?.toLowerCase() === githubUsername
      const isFork = repo.fork === true
      let matchesOwner = true
      if (ownerFilter === 'owned') {
        matchesOwner = isOwned && !isFork
      } else if (ownerFilter === 'forked') {
        matchesOwner = isFork
      } else if (ownerFilter === 'contributed') {
        // Contributed: repos where user is the owner (either owned or forked into their account)
        matchesOwner = isOwned
      }

      return matchesSearch && matchesLanguage && matchesOwner
    })
  }, [repos, searchQuery, languageFilter, ownerFilter, addedRepoUrls, user?.github_username])

  // Virtual list configuration
  const virtualizer = useVirtualizer({
    count: filteredRepos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated row height (repos with description ~110px, without ~80px)
    overscan: 5, // Render 5 extra items above/below viewport
  })

  // Track the actual user_id where token was saved (may differ due to merge)
  const [actualUserId, setActualUserId] = useState<number | null>(null)
  
  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (repoUrls: string[]) => {
      let targetUserId = actualUserId || user!.id
      
      // Electron: Ensure token is synced to backend before importing
      if (isElectron() && window.electron && !tokenSynced) {
        console.log('[RepoSelector] Syncing token before import...')
        const tokenResult = await window.electron.getGitHubToken()
        if (tokenResult.success && tokenResult.token) {
          const saveResult = await githubApi.saveToken(user!.id, tokenResult.token)
          setTokenSynced(true)
          
          // IMPORTANT: saveToken may return a different user_id if GitHub account was merged
          const returnedUserId = saveResult.data?.user_id
          if (returnedUserId && returnedUserId !== user!.id) {
            console.log(`[RepoSelector] Token saved to user ${returnedUserId} (merged from ${user!.id})`)
            setActualUserId(returnedUserId)
            targetUserId = returnedUserId
            
            // Update user store if needed
            if (saveResult.data?.github_username) {
              setUser({
                ...user!,
                id: returnedUserId,
                github_username: saveResult.data.github_username,
                github_avatar_url: saveResult.data.github_avatar_url || null,
              })
            }
          }
          console.log('[RepoSelector] Token synced, using user_id:', targetUserId)
        } else {
          throw new Error('Failed to get GitHub token from CLI')
        }
      }
      
      return githubApi.importRepos(targetUserId, repoUrls, false)
    },
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
        selection.deselectAll()

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
  const handleImport = () => {
    if (selection.selectedCount === 0) {
      toast({
        title: t('selectionRequired'),
        description: t('selectionRequiredDesc'),
        variant: 'destructive',
      })
      return
    }
    importMutation.mutate(selection.getSelectedArray())
  }

  const clearFilters = () => {
    setSearchQuery('')
    setLanguageFilter('all')
    setOwnerFilter('all')
  }

  // Render: Loading state (checking GitHub/CLI status)
  if (isCheckingAuth) {
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

  // Render: Status check failed (API error) - Web only
  if (!isElectron() && statusError) {
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
              {isElectron()
                ? t('cliConnectionRequiredDesc', 'GitHub CLI 인증이 필요합니다. 터미널에서 gh auth login을 실행하세요.')
                : t('connectionRequiredDesc')
              }
            </p>
            <Button onClick={() => navigate('/setup/github?returnUrl=/github/repos')}>
              <Github className="mr-2 h-4 w-4" />
              {t('connectGitHub')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render: Web mode - Connected but token invalid/expired
  if (!isElectron() && githubStatus?.connected && !githubStatus?.valid) {
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
            <Button onClick={() => navigate('/setup/github?returnUrl=/github/repos')}>
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
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${(isLoading || isRefreshing) ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={selection.selectedCount === 0 || importMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            {importMutation.isPending
              ? t('importing')
              : t('importSelected', { count: selection.selectedCount })
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

            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[160px]">
                <Github className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t('ownerFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allRepos')}</SelectItem>
                <SelectItem value="owned">{t('myRepos')}</SelectItem>
                <SelectItem value="forked">{t('forkedRepos')}</SelectItem>
                <SelectItem value="contributed">{t('contributedRepos')}</SelectItem>
              </SelectContent>
            </Select>

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

            {(searchQuery || languageFilter !== 'all' || ownerFilter !== 'all') && (
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
          {alreadyAddedCount > 0 && (
            <Badge variant="outline" className="text-gray-500">
              {t('hiddenAsAdded', { count: alreadyAddedCount })}
            </Badge>
          )}
          {selection.selectedCount > 0 && (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {t('selectedCount', { count: selection.selectedCount })}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => selection.toggleAll(filteredRepos.map((r: GitHubRepo) => r.clone_url))}>
          {selection.selectedCount === filteredRepos.length ? t('deselectAll') : t('selectAll')}
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
        <div
          ref={parentRef}
          className="h-[calc(100vh-380px)] min-h-[400px] overflow-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const repo = filteredRepos[virtualItem.index]
              return (
                <div
                  key={repo.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="pb-3">
                    <RepoCard
                      repo={repo}
                      selected={selection.isSelected(repo.clone_url)}
                      onToggle={() => selection.toggle(repo.clone_url)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Action Footer */}
      {selection.selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="py-3 px-6 flex items-center gap-4">
              <span className="text-sm font-medium">
                {t('reposSelected', { count: selection.selectedCount })}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => selection.deselectAll()}
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
    <SelectableTile
      id={repo.clone_url}
      selected={selected}
      onSelectChange={onToggle}
    >
      <CardContent className="py-4">
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
      </CardContent>
    </SelectableTile>
  )
}
