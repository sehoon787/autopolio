import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SortDropdown, SortOption } from '@/components/SortDropdown'
import { GitHubRepo } from '@/api/github'
import { isElectron } from '@/lib/electron'
import {
  Github,
  Search,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Filter,
  X,
  Layers,
} from 'lucide-react'
import { useRepoSelector } from './hooks/useRepoSelector'
import { RepoCard } from './components/RepoCard'
import { BundleDialog } from './components/BundleDialog'
import { LoadingPhaseCard } from './components/LoadingPhaseCard'

export default function RepoSelector() {
  const { t: tc } = useTranslation('common')
  const {
    navigate,
    t,
    queryClient,
    isCheckingAuth,
    statusError,
    isConnected,
    githubStatus,
    repos,
    totalRepos,
    filteredRepos,
    isLoading,
    isRefreshing,
    isError,
    isCached,
    refetch,
    handleRefresh,
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
    selection,
    parentRef,
    virtualizer,
    importMutation,
    handleImport,
    bundleDialogOpen,
    setBundleDialogOpen,
    bundleProjectName,
    setBundleProjectName,
    bundleRepos,
    handleOpenBundleDialog,
    handleBundleSetPrimary,
    handleBundleLabelChange,
    bundleCreateMutation,
  } = useRepoSelector()

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
                ? t('cliConnectionRequiredDesc')
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

  const repoSortOptions: SortOption[] = [
    { label: tc('sort.recentUpdate'), value: 'updated_at', defaultOrder: 'desc' },
    { label: tc('sort.recentPush'), value: 'pushed_at', defaultOrder: 'desc' },
    { label: tc('sort.name'), value: 'name', defaultOrder: 'asc' },
    { label: tc('sort.createdAt'), value: 'created_at', defaultOrder: 'desc' },
  ]

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
            onClick={handleRefresh}
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

      {/* Bundle Dialog */}
      <BundleDialog
        open={bundleDialogOpen}
        onOpenChange={setBundleDialogOpen}
        projectName={bundleProjectName}
        onProjectNameChange={setBundleProjectName}
        repos={bundleRepos}
        onSetPrimary={handleBundleSetPrimary}
        onLabelChange={handleBundleLabelChange}
        onSubmit={() => bundleCreateMutation.mutate()}
        isPending={bundleCreateMutation.isPending}
      />

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

            <SortDropdown
              options={repoSortOptions}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(newSortBy, newSortOrder) => { setSortBy(newSortBy); setSortOrder(newSortOrder) }}
            />

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
          {isCached && (
            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
              {t('cachedData')}
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
        <LoadingPhaseCard />
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
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="pb-2">
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
              {selection.selectedCount >= 2 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleOpenBundleDialog}
                  disabled={bundleCreateMutation.isPending}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  {t('bundleAsProject')}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
