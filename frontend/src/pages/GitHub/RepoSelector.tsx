import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SelectableTile } from '@/components/ui/selectable-tile'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { GitHubRepo } from '@/api/github'
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
  Layers,
} from 'lucide-react'
import { useRepoSelector, BundleRepoEntry } from './hooks/useRepoSelector'

export default function RepoSelector() {
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
    refetch,
    searchQuery,
    setSearchQuery,
    languageFilter,
    setLanguageFilter,
    ownerFilter,
    setOwnerFilter,
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

// Bundle Dialog Component
interface BundleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  onProjectNameChange: (name: string) => void
  repos: BundleRepoEntry[]
  onSetPrimary: (url: string) => void
  onLabelChange: (url: string, label: string) => void
  onSubmit: () => void
  isPending: boolean
}

function BundleDialog({
  open,
  onOpenChange,
  projectName,
  onProjectNameChange,
  repos,
  onSetPrimary,
  onLabelChange,
  onSubmit,
  isPending,
}: BundleDialogProps) {
  const { t } = useTranslation('github')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('bundleDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('bundleDialog.primaryNote')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('bundleDialog.projectName')}</label>
            <Input
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              placeholder={t('bundleDialog.projectNamePlaceholder')}
            />
          </div>

          {/* Repo List */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('bundleDialog.selectedRepos', { count: repos.length })}
            </label>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {repos.map((repo) => (
                <div
                  key={repo.url}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() => onSetPrimary(repo.url)}
                    className="shrink-0 text-lg leading-none hover:scale-110 transition-transform"
                    title={repo.isPrimary ? 'Primary' : 'Set as primary'}
                  >
                    {repo.isPrimary ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <Star className="h-4 w-4 text-gray-300" />
                    )}
                  </button>
                  <span className="text-sm font-medium truncate min-w-0 flex-1">
                    {repo.name}
                  </span>
                  <Input
                    value={repo.label}
                    onChange={(e) => onLabelChange(repo.url, e.target.value)}
                    placeholder={t('bundleDialog.labelPlaceholder')}
                    className="w-[140px] h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('bundleDialog.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !projectName.trim()}
          >
            {isPending ? t('bundleDialog.creating') : t('bundleDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
