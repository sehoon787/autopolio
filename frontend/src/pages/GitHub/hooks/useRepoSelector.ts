import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useSelection } from '@/hooks/useSelection'
import { githubApi, GitHubRepo } from '@/api/github'
import { projectsApi, ProjectRepositoryCreate } from '@/api/knowledge'
import { isElectron } from '@/lib/electron'

export interface BundleRepoEntry {
  url: string
  name: string
  label: string
  isPrimary: boolean
}

export function useRepoSelector() {
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
  const [sortBy, setSortBy] = useState<string>('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

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
  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
  } = useQuery({
    queryKey: ['github-status', user?.id],
    queryFn: () => githubApi.getStatus(user!.id),
    enabled: !!user?.id,
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
        const tokenResult = await window.electron!.getGitHubToken()
        if (!tokenResult.success || !tokenResult.token) {
          console.warn('[RepoSelector] Failed to get GitHub token from CLI')
          return
        }

        console.log('[RepoSelector] Syncing GitHub token to backend for user:', user.id)
        const saveResult = await githubApi.saveToken(user.id, tokenResult.token)

        const actualUserId = saveResult.data.user_id
        console.log('[RepoSelector] Token saved. Requested user:', user.id, 'Actual user:', actualUserId)

        if (actualUserId !== user.id) {
          console.log('[RepoSelector] User merged! Updating userStore from', user.id, 'to', actualUserId)
          setUser({
            ...user,
            id: actualUserId,
            github_username: saveResult.data.github_username || cliAuthStatus.username,
            github_avatar_url: saveResult.data.github_avatar_url || null,
          })
        } else {
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
      }
    }

    syncTokenToBackend()
  }, [cliAuthStatus, user, tokenSynced, setUser])

  // Determine if backend has the GitHub token synced (Electron + Web)
  const isBackendTokenSynced = statusData?.data?.connected === true && statusData?.data?.valid === true

  // Force refresh ref for manual refresh
  const forceRefreshRef = useRef(false)

  // Step 2: Fetch repos
  const { data: reposData, isLoading: reposLoading, isFetching: reposFetching, isError: reposError, refetch } = useQuery({
    queryKey: ['github-repos', user?.id, isBackendTokenSynced ? 'backend' : (isElectron() ? 'cli' : 'api')],
    queryFn: async () => {
      const forceRefresh = forceRefreshRef.current
      forceRefreshRef.current = false

      if (isBackendTokenSynced && user?.id) {
        console.log('[RepoSelector] Fetching repos via backend API (token synced, forceRefresh:', forceRefresh, ')...')
        return githubApi.getRepos(user.id, true, forceRefresh)
      }
      if (isElectron() && window.electron) {
        console.log('[RepoSelector] Fetching repos via gh CLI (token not yet synced)...')
        const result = await window.electron.listGitHubRepos()
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch repos via CLI')
        }
        return { data: { repos: result.repos, total: result.total, has_more: false } }
      }
      console.log('[RepoSelector] Fetching repos via backend API (forceRefresh:', forceRefresh, ')...')
      return githubApi.getRepos(user!.id, true, forceRefresh)
    },
    enabled: canFetchRepos && (isElectron() ? cliAuthStatus.checked : !!user?.id),
    retry: 1,
  })

  // Handle manual refresh with force_refresh
  const handleRefresh = useCallback(() => {
    forceRefreshRef.current = true
    refetch()
  }, [refetch])

  // Loading state
  const isCheckingAuth = isElectron() ? !cliAuthStatus.checked : statusLoading
  const isLoading = isCheckingAuth || (canFetchRepos && reposLoading)
  const isRefreshing = canFetchRepos && reposFetching && !reposLoading
  const isError = reposError

  // Virtual list scroll container ref
  const parentRef = useRef<HTMLDivElement>(null)

  const repos: GitHubRepo[] = (reposData?.data?.repos as GitHubRepo[]) || []
  const totalRepos = reposData?.data?.total || 0
  const isCached = (reposData?.data as any)?.cached === true

  // Get unique languages for filter
  const languages = useMemo(() => {
    const langSet = new Set<string>()
    repos.forEach((repo) => {
      if (repo.language) langSet.add(repo.language)
    })
    return Array.from(langSet).sort()
  }, [repos])

  // Filtered and sorted repos
  const filteredRepos = useMemo(() => {
    const githubUsername = user?.github_username?.toLowerCase() || ''

    const filtered = repos.filter((repo) => {
      const matchesSearch = searchQuery === '' ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesLanguage = languageFilter === 'all' || repo.language === languageFilter

      const isOwned = repo.owner?.toLowerCase() === githubUsername
      const isFork = repo.fork === true
      let matchesOwner = true
      if (ownerFilter === 'owned') {
        matchesOwner = isOwned && !isFork
      } else if (ownerFilter === 'forked') {
        matchesOwner = isFork
      } else if (ownerFilter === 'contributed') {
        matchesOwner = isOwned
      }

      return matchesSearch && matchesLanguage && matchesOwner
    })

    return [...filtered].sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1
      if (sortBy === 'name') {
        return dir * a.name.localeCompare(b.name)
      }
      const dateField = sortBy as 'updated_at' | 'pushed_at' | 'created_at'
      const aVal = a[dateField]
      const bVal = b[dateField]
      if (!aVal && !bVal) return 0
      if (!aVal) return 1
      if (!bVal) return -1
      return dir * (new Date(aVal).getTime() - new Date(bVal).getTime())
    })
  }, [repos, searchQuery, languageFilter, ownerFilter, user?.github_username, sortBy, sortOrder])

  // Virtual list configuration with dynamic measurement
  const virtualizer = useVirtualizer({
    count: filteredRepos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 5,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 88,
  })

  // Track the actual user_id where token was saved (may differ due to merge)
  const [actualUserId, setActualUserId] = useState<number | null>(null)

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (repoUrls: string[]) => {
      let targetUserId = actualUserId || user!.id

      if (isElectron() && window.electron && !tokenSynced) {
        console.log('[RepoSelector] Syncing token before import...')
        const tokenResult = await window.electron.getGitHubToken()
        if (tokenResult.success && tokenResult.token) {
          const saveResult = await githubApi.saveToken(user!.id, tokenResult.token)
          setTokenSynced(true)

          const returnedUserId = saveResult.data?.user_id
          if (returnedUserId && returnedUserId !== user!.id) {
            console.log(`[RepoSelector] Token saved to user ${returnedUserId} (merged from ${user!.id})`)
            setActualUserId(returnedUserId)
            targetUserId = returnedUserId

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

        selection.deselectAll()
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

  // Bundle dialog state
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false)
  const [bundleProjectName, setBundleProjectName] = useState('')
  const [bundleRepos, setBundleRepos] = useState<BundleRepoEntry[]>([])

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

  const handleOpenBundleDialog = useCallback(() => {
    const selectedUrls = selection.getSelectedArray()
    const repoEntries = selectedUrls.map((url, index) => {
      const repo = repos.find((r) => r.clone_url === url)
      return {
        url,
        name: repo?.name || url.split('/').pop()?.replace('.git', '') || url,
        label: '',
        isPrimary: index === 0,
      }
    })
    setBundleRepos(repoEntries)
    setBundleProjectName(repoEntries[0]?.name || '')
    setBundleDialogOpen(true)
  }, [selection, repos])

  const handleBundleSetPrimary = useCallback((url: string) => {
    setBundleRepos((prev) =>
      prev.map((r) => ({ ...r, isPrimary: r.url === url }))
    )
  }, [])

  const handleBundleLabelChange = useCallback((url: string, label: string) => {
    setBundleRepos((prev) =>
      prev.map((r) => r.url === url ? { ...r, label } : r)
    )
  }, [])

  // Bundle create mutation
  const bundleCreateMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = actualUserId || user!.id
      const primaryRepo = bundleRepos.find((r) => r.isPrimary) || bundleRepos[0]

      const [repoInfoRes, techRes] = await Promise.all([
        githubApi.getRepoInfo(targetUserId, primaryRepo.url),
        githubApi.detectTechnologies(targetUserId, primaryRepo.url),
      ])

      const repoInfo = repoInfoRes.data
      const technologies = techRes.data?.technologies || []

      const repositories: ProjectRepositoryCreate[] = bundleRepos.map((r) => ({
        git_url: r.url,
        label: r.label || undefined,
        is_primary: r.isPrimary,
      }))

      return projectsApi.create(targetUserId, {
        name: bundleProjectName,
        short_description: repoInfo.description || undefined,
        git_url: primaryRepo.url,
        project_type: 'personal',
        status: 'pending',
        start_date: repoInfo.start_date
          ? new Date(repoInfo.start_date).toISOString().split('T')[0]
          : undefined,
        technologies,
        repositories,
      })
    },
    onSuccess: () => {
      toast({
        title: t('bundleDialog.success'),
        description: t('bundleDialog.successDesc', {
          name: bundleProjectName,
          count: bundleRepos.length,
        }),
      })
      setBundleDialogOpen(false)
      selection.deselectAll()
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: any) => {
      toast({
        title: t('bundleDialog.error'),
        description: error?.response?.data?.detail || t('bundleDialog.errorDesc'),
        variant: 'destructive',
      })
    },
  })

  const clearFilters = () => {
    setSearchQuery('')
    setLanguageFilter('all')
    setOwnerFilter('all')
    setSortBy('updated_at')
    setSortOrder('desc')
  }

  return {
    // Navigation
    navigate,
    t,
    queryClient,

    // Auth & connection status
    isCheckingAuth,
    statusError,
    isConnected,
    githubStatus,

    // Repos data
    repos,
    totalRepos,
    filteredRepos,
    isLoading,
    isRefreshing,
    isError,
    isCached,
    refetch,
    handleRefresh,

    // Filters
    searchQuery,
    setSearchQuery,
    languageFilter,
    setLanguageFilter,
    ownerFilter,
    setOwnerFilter,
    sortBy,
    sortOrder,
    setSortBy,
    setSortOrder,
    languages,
    clearFilters,

    // Selection
    selection,

    // Virtual list
    parentRef,
    virtualizer,

    // Import
    importMutation,
    handleImport,

    // Bundle dialog
    bundleDialogOpen,
    setBundleDialogOpen,
    bundleProjectName,
    setBundleProjectName,
    bundleRepos,
    handleOpenBundleDialog,
    handleBundleSetPrimary,
    handleBundleLabelChange,
    bundleCreateMutation,
  }
}

export type UseRepoSelectorReturn = ReturnType<typeof useRepoSelector>
