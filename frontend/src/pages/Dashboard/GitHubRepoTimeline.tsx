import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SortDropdown, SortOption } from '@/components/SortDropdown'
import { Github, Filter, X } from 'lucide-react'
import type { GitHubRepo } from '@/api/github'
import { getTimelineRange, dateToPercent, generateYearTicks, formatDate, LABEL_COL_CLASS, MIN_BAR_WIDTH_PCT } from './timelineUtils'

// GitHub language color map (matches github.com)
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  'C#': '#178600',
  C: '#555555',
  'C++': '#f34b7d',
  Swift: '#F05138',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
}

const DEFAULT_COLOR = '#8b8b8b'
const INITIAL_SHOW = 15

interface GitHubRepoTimelineProps {
  repos: GitHubRepo[] | undefined
  isConnected: boolean | undefined
  isLoading: boolean
  githubUsername?: string
}

export default function GitHubRepoTimeline({ repos, isConnected, isLoading, githubUsername }: GitHubRepoTimelineProps) {
  const { t } = useTranslation()
  const { t: tc } = useTranslation('common')
  const { t: tg } = useTranslation('github')
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  // Filter & sort state — defaults match RepoSelector
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const allRepos = repos || []

  const languages = useMemo(() => {
    const langSet = new Set<string>()
    allRepos.forEach((repo) => { if (repo.language) langSet.add(repo.language) })
    return Array.from(langSet).sort()
  }, [allRepos])

  const filteredRepos = useMemo(() => {
    if (allRepos.length === 0) return []
    const username = githubUsername?.toLowerCase() || ''

    const filtered = allRepos.filter((repo) => {
      const matchesLanguage = languageFilter === 'all' || repo.language === languageFilter

      const isOwned = repo.owner?.toLowerCase() === username
      const isFork = repo.fork === true
      let matchesOwner = true
      if (ownerFilter === 'owned') matchesOwner = isOwned && !isFork
      else if (ownerFilter === 'forked') matchesOwner = isFork
      else if (ownerFilter === 'contributed') matchesOwner = isOwned

      return matchesLanguage && matchesOwner
    })

    return [...filtered].sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1
      if (sortBy === 'name') return dir * a.name.localeCompare(b.name)
      const dateField = sortBy as 'updated_at' | 'pushed_at' | 'created_at'
      const aVal = a[dateField]
      const bVal = b[dateField]
      if (!aVal && !bVal) return 0
      if (!aVal) return 1
      if (!bVal) return -1
      return dir * (new Date(aVal).getTime() - new Date(bVal).getTime())
    })
  }, [allRepos, languageFilter, ownerFilter, githubUsername, sortBy, sortOrder])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:repoTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={`${LABEL_COL_CLASS} h-4 bg-muted animate-pulse rounded`} />
                <div className="flex-1 h-5 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:repoTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Github className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('dashboard:repoTimeline.empty')}</p>
            <button
              onClick={() => navigate('/setup/github')}
              className="text-primary hover:underline text-sm mt-2"
            >
              {t('dashboard:repoTimeline.connectGitHub')}
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (allRepos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:repoTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Github className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('dashboard:repoTimeline.noRepos')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const visibleRepos = showAll ? filteredRepos : filteredRepos.slice(0, INITIAL_SHOW)
  const hasMore = filteredRepos.length > INITIAL_SHOW

  const allDates = filteredRepos.flatMap((r) => [r.created_at, r.pushed_at])
  const range = getTimelineRange(allDates)
  const yearTicks = generateYearTicks(range.start, range.end)

  const hasActiveFilters = languageFilter !== 'all' || ownerFilter !== 'all'
  const clearFilters = () => { setLanguageFilter('all'); setOwnerFilter('all') }

  const repoSortOptions: SortOption[] = [
    { label: tc('sort.recentUpdate'), value: 'updated_at', defaultOrder: 'desc' },
    { label: tc('sort.recentPush'), value: 'pushed_at', defaultOrder: 'desc' },
    { label: tc('sort.name'), value: 'name', defaultOrder: 'asc' },
    { label: tc('sort.createdAt'), value: 'created_at', defaultOrder: 'desc' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto">{t('dashboard:repoTimeline.title')}</CardTitle>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[120px] h-7 text-xs">
              <Github className="mr-1 h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tg('allRepos')}</SelectItem>
              <SelectItem value="owned">{tg('myRepos')}</SelectItem>
              <SelectItem value="forked">{tg('forkedRepos')}</SelectItem>
              <SelectItem value="contributed">{tg('contributedRepos')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <Filter className="mr-1 h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tg('allLanguages')}</SelectItem>
              {languages.map((lang) => (
                <SelectItem key={lang} value={lang}>{lang}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SortDropdown
            compact
            options={repoSortOptions}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(newSortBy, newSortOrder) => { setSortBy(newSortBy); setSortOrder(newSortOrder) }}
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" />
              {tg('clearFilters')}
            </Button>
          )}
        </div>
        {hasActiveFilters && (
          <p className="text-xs text-muted-foreground mt-1">
            {tg('showingCount', { showing: filteredRepos.length, total: allRepos.length })}
          </p>
        )}
      </CardHeader>
      <CardContent>

        <div className="relative">
          {/* Year ticks */}
          <div className="flex items-center mb-3">
            <div className={`${LABEL_COL_CLASS} shrink-0`} />
            <div className="flex-1 relative h-5">
              {yearTicks.map((year) => {
                const pct = dateToPercent(new Date(year, 0, 1), range.start, range.end)
                return (
                  <span
                    key={year}
                    className="absolute text-xs text-muted-foreground -translate-x-1/2"
                    style={{ left: `${pct}%` }}
                  >
                    {year}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Repo rows */}
          <TooltipProvider delayDuration={200}>
            {filteredRepos.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {t('dashboard:repoTimeline.noRepos')}
              </div>
            ) : (
              visibleRepos.map((repo) => {
                const createdAt = new Date(repo.created_at)
                const endAt = repo.pushed_at ? new Date(repo.pushed_at) : new Date()
                const startPct = dateToPercent(createdAt, range.start, range.end)
                const endPct = dateToPercent(endAt, range.start, range.end)
                const widthPct = Math.max(endPct - startPct, MIN_BAR_WIDTH_PCT)
                const color = (repo.language && LANG_COLORS[repo.language]) || DEFAULT_COLOR

                return (
                  <div key={repo.id} className="flex items-center mb-2">
                    <div className={`${LABEL_COL_CLASS} shrink-0 pr-3 flex items-center gap-1.5 min-w-0`}>
                      <span className={`text-sm truncate ${repo.fork ? 'opacity-50' : ''}`}>
                        {repo.name}
                      </span>
                      {repo.language && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 shrink-0"
                          style={{ borderColor: color, color }}
                        >
                          {repo.language}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 relative h-5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-0 h-5 rounded cursor-pointer transition-opacity hover:opacity-100 ${repo.fork ? 'opacity-40' : 'opacity-70'}`}
                            style={{
                              left: `${startPct}%`,
                              width: `${widthPct}%`,
                              minWidth: '3px',
                              backgroundColor: color,
                            }}
                            onClick={() => window.open(repo.html_url, '_blank')}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium">{repo.full_name}</p>
                          {repo.description && (
                            <p className="text-xs text-muted-foreground mt-1">{repo.description}</p>
                          )}
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{t('dashboard:repoTimeline.stars', { count: repo.stargazers_count })}</span>
                            <span>{t('dashboard:repoTimeline.forks', { count: repo.forks_count })}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(repo.created_at)} – {formatDate(repo.pushed_at)}
                          </p>
                          {repo.fork && <p className="text-xs italic mt-1">Fork</p>}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })
            )}
          </TooltipProvider>

          {/* Show all / show less toggle */}
          {hasMore && (
            <div className="text-center mt-3">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-primary hover:underline"
              >
                {showAll
                  ? t('dashboard:repoTimeline.showLess')
                  : t('dashboard:repoTimeline.showAll', { count: filteredRepos.length })}
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
