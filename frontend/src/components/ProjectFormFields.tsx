/**
 * ProjectFormFields - Shared form fields for project create/edit dialogs
 * Supports multi-repository input with GitHub repo search dropdown
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { TechBadge } from '@/components/ui/tech-badge'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContentNoPortal,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ProjectCreate, ProjectRepositoryCreate } from '@/api/knowledge'
import { GitHubRepo } from '@/api/github'
import { Plus, Trash2, Star, StarOff, Search, Github, Check, Pencil, Loader2 } from 'lucide-react'

interface Company {
  id: number
  name: string
}

export interface ProjectFormFieldsProps {
  formData: Partial<ProjectCreate>
  onChange: (data: Partial<ProjectCreate>) => void
  companies: Company[]
  techInput: string
  onTechInputChange: (value: string) => void
  onAddTechnology: () => void
  onRemoveTechnology: (tech: string) => void
  isOngoing: boolean
  onOngoingChange: (isOngoing: boolean) => void
  onAddRepository?: (repo: ProjectRepositoryCreate) => void
  onRemoveRepository?: (index: number) => void
  onUpdateRepository?: (index: number, repo: Partial<ProjectRepositoryCreate>) => void
  onSetPrimaryRepository?: (index: number) => void
  githubRepos?: GitHubRepo[]
  onRepoSelected?: (repoUrl: string) => void
  isLoadingRepoInfo?: boolean
  idPrefix?: string
}

export function ProjectFormFields({
  formData,
  onChange,
  companies,
  techInput,
  onTechInputChange,
  onAddTechnology,
  onRemoveTechnology,
  isOngoing,
  onOngoingChange,
  onAddRepository,
  onRemoveRepository,
  onUpdateRepository,
  onSetPrimaryRepository,
  githubRepos,
  onRepoSelected,
  isLoadingRepoInfo,
  idPrefix = '',
}: ProjectFormFieldsProps) {
  const { t } = useTranslation('projects')
  const { t: tc } = useTranslation('common')

  const [newRepoUrl, setNewRepoUrl] = useState('')
  const [newRepoLabel, setNewRepoLabel] = useState('')
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false)
  const [isManualInput, setIsManualInput] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const repositories = formData.repositories || []
  const hasMultiRepoSupport = !!onAddRepository
  const hasGithubRepos = githubRepos && githubRepos.length > 0

  // Set of already-added repo URLs for marking in dropdown
  const addedRepoUrls = useMemo(() => {
    const urls = new Set<string>()
    repositories.forEach((r) => {
      if (r.git_url) {
        urls.add(r.git_url.toLowerCase().replace(/\.git$/, ''))
      }
    })
    return urls
  }, [repositories])

  // Filtered GitHub repos based on search
  const filteredGithubRepos = useMemo(() => {
    if (!githubRepos) return []
    if (!repoSearchQuery.trim()) return githubRepos
    const q = repoSearchQuery.toLowerCase()
    return githubRepos.filter(
      (repo) =>
        repo.full_name.toLowerCase().includes(q) ||
        repo.name.toLowerCase().includes(q) ||
        repo.description?.toLowerCase().includes(q)
    )
  }, [githubRepos, repoSearchQuery])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isRepoDropdownOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isRepoDropdownOpen])

  const isRepoAdded = (repo: GitHubRepo) => {
    const normalizedHtml = repo.html_url.toLowerCase().replace(/\.git$/, '')
    const normalizedClone = repo.clone_url.toLowerCase().replace(/\.git$/, '')
    return addedRepoUrls.has(normalizedHtml) || addedRepoUrls.has(normalizedClone)
  }

  const handleChange = <K extends keyof ProjectCreate>(
    key: K,
    value: ProjectCreate[K]
  ) => {
    onChange({ ...formData, [key]: value })
  }

  const handleAddRepo = () => {
    const url = newRepoUrl.trim()
    if (!url || !onAddRepository) return
    onAddRepository({
      git_url: url,
      label: newRepoLabel.trim() || undefined,
      is_primary: repositories.length === 0,
    })
    setNewRepoUrl('')
    setNewRepoLabel('')
  }

  const handleSelectGithubRepo = (repo: GitHubRepo) => {
    if (!onAddRepository || isRepoAdded(repo)) return
    // addRepository already sets git_url from primary repo via functional updater
    onAddRepository({
      git_url: repo.html_url,
      label: newRepoLabel.trim() || undefined,
      is_primary: repositories.length === 0,
    })
    setNewRepoLabel('')
    setRepoSearchQuery('')
    setIsRepoDropdownOpen(false)
    onRepoSelected?.(repo.html_url)
  }

  return (
    <>
      {/* Project Name */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}name`}>{t('dialog.projectName')} *</Label>
        <Input
          id={`${idPrefix}name`}
          value={formData.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={t('dialog.projectNamePlaceholder')}
          required
        />
        <p className="text-xs text-gray-500">{t('dialog.projectNameHint')}</p>
      </div>

      {/* Short Description */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}short_description`}>{t('dialog.shortDesc')}</Label>
        <Input
          id={`${idPrefix}short_description`}
          value={formData.short_description || ''}
          onChange={(e) => handleChange('short_description', e.target.value)}
          placeholder={t('dialog.shortDescPlaceholder')}
        />
      </div>

      {/* Project Type & Company */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('dialog.projectType')}</Label>
          <Select
            value={formData.project_type || 'company'}
            onValueChange={(v) => handleChange('project_type', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">{t('projectTypes.companyProject')}</SelectItem>
              <SelectItem value="personal">{t('projectTypes.personalProject')}</SelectItem>
              <SelectItem value="open-source">{t('projectTypes.openSource')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('dialog.company')}</Label>
          <Select
            value={formData.company_id?.toString() || ''}
            onValueChange={(v) => handleChange('company_id', v ? parseInt(v) : undefined)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('dialog.selectOptional')} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Start/End Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}start_date`}>{t('dialog.startDate')}</Label>
          <Input
            id={`${idPrefix}start_date`}
            type="date"
            value={formData.start_date || ''}
            max={formData.end_date || undefined}
            onChange={(e) => handleChange('start_date', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}end_date`}>{t('dialog.endDate')}</Label>
          <Input
            id={`${idPrefix}end_date`}
            type="date"
            value={formData.end_date || ''}
            min={formData.start_date || undefined}
            onChange={(e) => handleChange('end_date', e.target.value)}
            disabled={isOngoing}
            className={isOngoing ? 'bg-gray-100 cursor-not-allowed' : ''}
          />
        </div>
      </div>

      {/* Ongoing Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`${idPrefix}is_ongoing`}
          checked={isOngoing}
          onChange={(e) => {
            onOngoingChange(e.target.checked)
            if (e.target.checked) {
              handleChange('end_date', '')
            }
          }}
        />
        <Label htmlFor={`${idPrefix}is_ongoing`} className="cursor-pointer">
          {t('dialog.ongoingProject')}
        </Label>
      </div>

      {/* Role / Team Size / Contribution */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}role`}>{t('dialog.role')}</Label>
          <Input
            id={`${idPrefix}role`}
            value={formData.role || ''}
            onChange={(e) => handleChange('role', e.target.value)}
            placeholder={t('dialog.rolePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}team_size`}>{t('dialog.teamSize')}</Label>
          <Input
            id={`${idPrefix}team_size`}
            type="number"
            value={formData.team_size || ''}
            onChange={(e) =>
              handleChange('team_size', e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}contribution_percent`}>{t('dialog.contribution')}</Label>
          <Input
            id={`${idPrefix}contribution_percent`}
            type="number"
            min="0"
            max="100"
            value={formData.contribution_percent || ''}
            onChange={(e) =>
              handleChange(
                'contribution_percent',
                e.target.value ? parseInt(e.target.value) : undefined
              )
            }
            placeholder="70"
          />
        </div>
      </div>

      {/* Git URL / Repositories */}
      {hasMultiRepoSupport ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('dialog.githubRepos', 'GitHub Repositories')}</Label>
            {repositories.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {repositories.length} {repositories.length === 1 ? 'repo' : 'repos'}
              </Badge>
            )}
          </div>

          {/* Existing repositories list */}
          {repositories.length > 0 && (
            <div className="space-y-2">
              {repositories.map((repo, index) => (
                <div
                  key={repo.git_url || index}
                  className={`flex items-center gap-2 p-2 rounded-md border ${
                    repo.is_primary ? 'border-primary/50 bg-primary/5' : 'border-gray-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSetPrimaryRepository?.(index)}
                    className="shrink-0"
                    title={repo.is_primary ? t('dialog.primaryRepo', 'Primary repository') : t('dialog.setAsPrimary', 'Set as primary')}
                  >
                    {repo.is_primary ? (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    ) : (
                      <StarOff className="h-4 w-4 text-gray-300 hover:text-yellow-400" />
                    )}
                  </button>
                  <div className="flex-1 text-sm truncate text-gray-700" title={repo.git_url}>
                    {repo.git_url.replace('https://github.com/', '')}
                  </div>
                  <Input
                    value={repo.label || ''}
                    onChange={(e) => onUpdateRepository?.(index, { label: e.target.value })}
                    placeholder={t('dialog.repoLabel', 'Label (e.g. Backend)')}
                    className="w-32 h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => onRemoveRepository?.(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400 hover:text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new repository - GitHub search or manual input */}
          {hasGithubRepos && !isManualInput ? (
            <div className="flex items-center gap-2">
              <Popover open={isRepoDropdownOpen} onOpenChange={setIsRepoDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-8 justify-start text-sm font-normal text-muted-foreground"
                    disabled={isLoadingRepoInfo}
                  >
                    {isLoadingRepoInfo ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        {t('dialog.loadingRepoInfo')}
                      </>
                    ) : (
                      <>
                        <Search className="h-3.5 w-3.5 mr-2" />
                        {t('dialog.searchRepoPlaceholder', 'Search GitHub repos...')}
                      </>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContentNoPortal
                  className="p-0 w-[var(--radix-popover-trigger-width)]"
                  align="start"
                  sideOffset={4}
                >
                  {/* Search input */}
                  <div className="flex items-center border-b px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    <input
                      ref={searchInputRef}
                      value={repoSearchQuery}
                      onChange={(e) => setRepoSearchQuery(e.target.value)}
                      placeholder={t('dialog.searchRepoPlaceholder', 'Search repos...')}
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  {/* Repo list */}
                  <div className="max-h-[240px] overflow-y-auto overscroll-contain">
                    {filteredGithubRepos.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        {t('dialog.noReposFound', 'No repos found')}
                      </div>
                    ) : (
                      filteredGithubRepos.map((repo) => {
                        const added = isRepoAdded(repo)
                        return (
                          <button
                            key={repo.id}
                            type="button"
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 ${
                              added ? 'opacity-50 cursor-default' : 'cursor-pointer'
                            }`}
                            onClick={() => !added && handleSelectGithubRepo(repo)}
                            disabled={added}
                          >
                            <Github className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate block">{repo.full_name}</span>
                              {repo.description && (
                                <span className="text-xs text-muted-foreground truncate block">
                                  {repo.description}
                                </span>
                              )}
                            </div>
                            {repo.language && (
                              <Badge variant="outline" className="text-xs shrink-0 h-5">
                                {repo.language}
                              </Badge>
                            )}
                            {added && (
                              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                  {/* Manual input option at bottom */}
                  <div className="border-t">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground"
                      onClick={() => {
                        setIsManualInput(true)
                        setIsRepoDropdownOpen(false)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t('dialog.manualUrlInput', 'Enter URL manually')}
                    </button>
                  </div>
                </PopoverContentNoPortal>
              </Popover>
              <Input
                value={newRepoLabel}
                onChange={(e) => setNewRepoLabel(e.target.value)}
                placeholder={t('dialog.repoLabel', 'Label')}
                className="w-32 h-8 text-sm"
              />
            </div>
          ) : (
            /* Manual URL input mode */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repo"
                  className="flex-1 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddRepo()
                    }
                  }}
                />
                <Input
                  value={newRepoLabel}
                  onChange={(e) => setNewRepoLabel(e.target.value)}
                  placeholder={t('dialog.repoLabel', 'Label')}
                  className="w-32 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddRepo()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={handleAddRepo}
                  disabled={!newRepoUrl.trim()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {tc('add')}
                </Button>
              </div>
              {hasGithubRepos && isManualInput && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setIsManualInput(false)}
                >
                  <Github className="h-3 w-3 mr-1" />
                  {t('dialog.backToGithubSearch', 'Back to GitHub search')}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500">
            {t('dialog.multiRepoHint', 'Add multiple repositories for projects with separate backend/frontend/infra repos. Star marks the primary repo.')}
          </p>
        </div>
      ) : (
        /* Fallback: Single Git URL input (when multi-repo callbacks not provided) */
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}git_url`}>{t('dialog.githubUrl')}</Label>
          <Input
            id={`${idPrefix}git_url`}
            value={formData.git_url || ''}
            onChange={(e) => handleChange('git_url', e.target.value)}
            placeholder="https://github.com/username/repo"
          />
        </div>
      )}

      {/* Technologies */}
      <div className="space-y-2">
        <Label>{t('dialog.techStack')}</Label>
        <div className="flex gap-2">
          <Input
            value={techInput}
            onChange={(e) => onTechInputChange(e.target.value)}
            placeholder={t('dialog.techInputPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAddTechnology()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={onAddTechnology}>
            {tc('add')}
          </Button>
        </div>
        {formData.technologies && formData.technologies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.technologies.map((tech) => (
              <TechBadge
                key={tech}
                tech={tech}
                className="cursor-pointer hover:opacity-80"
                onClick={() => onRemoveTechnology(tech)}
              />
            ))}
            <span className="text-xs text-gray-500 self-center ml-1">
              ({t('dialog.clickToRemove')})
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}description`}>{t('dialog.description')}</Label>
        <Textarea
          id={`${idPrefix}description`}
          value={formData.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={4}
        />
      </div>
    </>
  )
}
