import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { Progress } from '@/components/ui/progress'
import { SelectableTile } from '@/components/ui/selectable-tile'
import { SelectionActionBar } from '@/components/ui/selection-action-bar'
import { useAnalysisStore } from '@/stores/analysisStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Project } from '@/api/knowledge'
import {
  KanbanBoard,
} from '@/components/KanbanBoard'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ScrollToTop } from '@/components/ScrollToTop'
import { ExportDialog } from '@/components/ExportDialog'
import { ProjectFormFields } from '@/components/ProjectFormFields'
import { ProjectFilters } from '@/components/ProjectFilters'
import { SortDropdown, SortOption } from '@/components/SortDropdown'
import { Plus, Pencil, Trash2, FolderKanban, Github, ExternalLink, Loader2, Sparkles, Kanban, List, Filter, X, Search, Play, RefreshCw, Calendar, Users, Briefcase, FileDown, StopCircle, Star } from 'lucide-react'
import { useProjectsPage, ProjectKanbanItem } from './hooks/useProjectsPage'
import { UpgradePrompt } from '@/components/UpgradePrompt'

// Kanban card component
function ProjectKanbanCard({ project }: { project: Project }) {
  const { t } = useTranslation('projects')
  const { isAnalyzing, getProgress } = useAnalysisStore()
  const analyzing = isAnalyzing(project.id)
  const progress = getProgress(project.id)

  return (
    <Card className="hover:shadow-md transition-shadow bg-white">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/knowledge/projects/${project.id}`} className="font-medium text-sm hover:text-primary hover:underline line-clamp-2">
            {project.name}
          </Link>
          <div className="flex items-center gap-1">
            {analyzing && (
              <Badge className="bg-blue-500 text-white animate-pulse text-xs shrink-0">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                {progress}%
              </Badge>
            )}
            {project.project_type && !analyzing && (
              <Badge variant="outline" className="text-xs shrink-0">
                {project.project_type === 'company' ? t('projectTypes.company') :
                 project.project_type === 'personal' ? t('projectTypes.personal') :
                 project.project_type === 'open-source' ? t('projectTypes.openSource') : project.project_type}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {project.short_description && <p className="text-xs text-gray-600 line-clamp-2">{project.short_description}</p>}
        <div className="flex flex-wrap gap-1">
          {project.technologies?.slice(0, 4).map((tech) => <TechBadge key={tech.id} tech={tech.name} size="sm" />)}
          {project.technologies?.length > 4 && <Badge variant="secondary" className="text-xs py-0">+{project.technologies.length - 4}</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
          {project.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(project.start_date)}</span>}
          {project.team_size && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t('teamSizeValue', { count: project.team_size })}</span>}
          {project.role && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{project.role}</span>}
        </div>
        {(project.git_url || (project.repositories && project.repositories.length > 0)) && (
          <div className="flex items-center gap-1 pt-1">
            <Github className="h-3 w-3 text-primary" />
            {project.repositories && project.repositories.length > 1 ? (
              <span className="text-xs text-primary">{project.repositories.length} repos</span>
            ) : project.git_url ? (
              <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                GitHub<ExternalLink className="h-2 w-2 inline ml-0.5" />
              </a>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ProjectsPage() {
  const {
    t,
    tc,
    user,
    isAnalyzing,
    getProgress,
    getJob,
    cancelAnalysis,
    viewMode,
    setViewMode,
    batchProgress,
    isDialogOpen,
    setIsDialogOpen,
    isFilterOpen,
    setIsFilterOpen,
    isExportDialogOpen,
    setIsExportDialogOpen,
    searchInput,
    setSearchInput,
    isLoadingRepoInfo,
    isGeneratingAI,
    filters,
    setFilters,
    activeFilterCount,
    selection,
    createForm,
    editForm,
    editingProject,
    setEditingProject,
    deleteTarget,
    setDeleteTarget,
    isBatchDeleteDialogOpen,
    setIsBatchDeleteDialogOpen,
    isGitHubConnected,
    githubRepos,
    projects,
    companies,
    projectsData,
    isLoading,
    createMutation,
    deleteMutation,
    updateMutation,
    batchDeleteMutation,
    isBatchAnalyzing,
    selectedAnalyzableProjects,
    pendingProjects,
    clearFilters,
    handleSearch,
    handleRepoSelected,
    handleEditRepoSelected,
    handleGenerateAI,
    handleSubmit,
    handleEditProject,
    handleEditSubmit,
    handleBatchAnalyze,
    handleSelectedBatchAnalyze,
    handleSelectedBatchDelete,
    columns,
    handleMove,
    tierLimitError,
    setTierLimitError,
  } = useProjectsPage()

  const projectSortOptions: SortOption[] = [
    { label: tc('sort.recentCreated'), value: 'created_at', defaultOrder: 'desc' },
    { label: tc('sort.projectName'), value: 'name', defaultOrder: 'asc' },
    { label: tc('sort.startDate'), value: 'start_date', defaultOrder: 'desc' },
    { label: tc('sort.recentModified'), value: 'updated_at', defaultOrder: 'desc' },
    { label: tc('sort.analysisStatus'), value: 'is_analyzed', defaultOrder: 'asc' },
  ]

  // Extract current sort state from filters
  const currentSortBy = filters.sort_by?.split(',')[0] || 'created_at'
  const currentSortOrder = (filters.sort_order?.split(',')[0] || 'desc') as 'asc' | 'desc'

  const handleSortChange = (newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setFilters((prev) => ({ ...prev, sort_by: newSortBy, sort_order: newSortOrder }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'kanban' && pendingProjects.length > 0 && (
            <Button onClick={handleBatchAnalyze} disabled={isBatchAnalyzing} variant="outline">
              {isBatchAnalyzing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {isBatchAnalyzing ? t('analyzing', { current: batchProgress?.current || 0, total: batchProgress?.total || 0 }) : t('batchAnalysis', { count: pendingProjects.length })}
            </Button>
          )}
          <Link to="/github/repos"><Button variant="outline"><Github className="h-4 w-4 mr-2" />{t('importRepos')}</Button></Link>
          <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}><FileDown className="h-4 w-4 mr-2" />{t('exportProjects')}</Button>
          <div className="flex items-center border rounded-lg">
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" className="rounded-r-none" onClick={() => setViewMode('list')}><List className="h-4 w-4 mr-1" />{t('listView')}</Button>
            <Button variant={viewMode === 'kanban' ? 'default' : 'ghost'} size="sm" className="rounded-l-none" onClick={() => setViewMode('kanban')}><Kanban className="h-4 w-4 mr-1" />{t('kanbanView')}</Button>
          </div>
          <Button onClick={() => { createForm.reset(); setIsDialogOpen(true) }}><Plus className="h-4 w-4 mr-2" />{t('addProject')}</Button>
        </div>
      </div>

      {/* Tier limit warning */}
      {tierLimitError && (
        <div className="relative">
          <button className="absolute top-2 right-2 text-amber-600 hover:text-amber-800" onClick={() => setTierLimitError(null)}>
            <X className="h-4 w-4" />
          </button>
          <UpgradePrompt type="project" />
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder={t('searchPlaceholder')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="pl-10" />
          </div>
          <Button variant="outline" onClick={handleSearch}>{tc('search')}</Button>
        </div>
        <SortDropdown
          options={projectSortOptions}
          sortBy={currentSortBy}
          sortOrder={currentSortOrder}
          onSortChange={handleSortChange}
        />
        <Button variant={isFilterOpen ? 'secondary' : 'outline'} onClick={() => setIsFilterOpen(!isFilterOpen)}>
          <Filter className="h-4 w-4 mr-2" />{t('filter')}{activeFilterCount > 0 && <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-xs">{activeFilterCount}</Badge>}
        </Button>
        {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1" />{t('clearFilters')}</Button>}
      </div>

      {/* Filter Panel */}
      <ProjectFilters isOpen={isFilterOpen} onOpenChange={setIsFilterOpen} filters={filters} onFiltersChange={setFilters} companies={companies} />

      {/* Results count */}
      {projectsData?.data && <div className="text-sm text-gray-500">{t('projectCount', { count: projectsData.data.total })}{activeFilterCount > 0 && ` (${t('filterApplied')})`}</div>}

      {/* Batch analysis progress */}
      {batchProgress && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('batchAnalysisInProgress')}</span>
                  <span className="text-sm text-gray-500">{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-8">{tc('loading')}</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noProjects')}</h3>
            <p className="text-gray-500 mb-4">{t('noProjectsDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('addFirstProject')}</Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          <SelectionActionBar totalCount={projects.length} selectedCount={selection.selectedCount} onSelectAllChange={(selectAll) => selectAll ? selection.selectAll(projects.map(p => p.id)) : selection.deselectAll()} selectAllLabel={t('selectAll')} selectedCountLabel={`(${selection.selectedCount} ${tc('selected')})`}>
            <Button onClick={handleSelectedBatchAnalyze} disabled={isBatchAnalyzing || selectedAnalyzableProjects.length === 0} size="sm">
              {isBatchAnalyzing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}{t('analyze')} ({selectedAnalyzableProjects.length})
            </Button>
            <Button onClick={handleSelectedBatchDelete} disabled={batchDeleteMutation.isPending} size="sm" variant="destructive">
              {batchDeleteMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}{tc('delete')} ({selection.selectedCount})
            </Button>
          </SelectionActionBar>
          <div className="grid gap-4">
            {projects.map((project) => {
              const analyzing = isAnalyzing(project.id)
              const progress = getProgress(project.id)
              const job = getJob(project.id)

              return (
                <SelectableTile key={project.id} id={project.id} selected={selection.isSelected(project.id)} onSelectChange={() => selection.toggle(project.id)} className="hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link to={`/knowledge/projects/${project.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold">{project.name}</h3></Link>
                          {analyzing ? (
                            <Badge className="bg-blue-500 text-white animate-pulse">
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              {t('backgroundAnalysis.inProgress')} ({progress}%)
                            </Badge>
                          ) : project.is_analyzed ? (
                            <>
                              <Badge variant="success">{t('analyzed')}</Badge>
                              {project.last_analyzed_at && (
                                <span className="text-xs text-gray-400">{t('analyzedAt', { date: formatDateTime(project.last_analyzed_at) })}</span>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">{t('notAnalyzed')}</Badge>
                          )}
                          {project.project_type && <Badge variant="outline">{project.project_type}</Badge>}
                          {project.ai_tools_detected && project.ai_tools_detected.length > 0 && (
                            <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 border border-violet-300 dark:border-violet-700 text-xs gap-1">
                              <span className="inline-block w-3 h-3 mr-0.5">🤖</span>
                              {t('detail.badge.vibeCoding')}
                            </Badge>
                          )}
                        </div>
                        {analyzing && job && (
                          <div className="mb-2 flex items-center gap-2">
                            <Progress value={progress} className="h-2 flex-1 max-w-xs" />
                            <span className="text-xs text-gray-500">{progress}%</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (user?.id) cancelAnalysis(user.id, project.id)
                              }}
                            >
                              <StopCircle className="h-3 w-3 mr-1" />
                              {t('backgroundAnalysis.cancel')}
                            </Button>
                          </div>
                        )}
                        {project.short_description && <p className="text-gray-700">{project.short_description}</p>}
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                          {project.start_date && <span>{formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : t('ongoing')}</span>}
                          {project.role && <span>· {project.role}</span>}
                          {project.team_size && <span>· {t('teamSizeValue', { count: project.team_size })}</span>}
                        </div>
                        {project.technologies?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {project.technologies.slice(0, 10).map((tech) => <TechBadge key={tech.id} tech={tech.name} />)}
                            {project.technologies.length > 10 && <Badge variant="outline" className="text-xs">{t('detail.basicInfo.moreCount', { count: project.technologies.length - 10 })}</Badge>}
                          </div>
                        )}
                        {(project.git_url || (project.repositories && project.repositories.length > 0)) && (
                          <div className="mt-3 flex items-center gap-2">
                            {project.repositories && project.repositories.length > 1 ? (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  <Github className="h-3 w-3 mr-1" />{project.repositories.length} repos
                                </Badge>
                                {project.repositories.map((repo) => (
                                  <a key={repo.id || repo.git_url} href={repo.git_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-primary rounded hover:bg-primary/5 hover:underline" onClick={(e) => e.stopPropagation()}>
                                    {repo.label || repo.git_url.split('/').pop()}{repo.is_primary && <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />}
                                  </a>
                                ))}
                              </>
                            ) : project.git_url ? (
                              <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 text-sm text-primary rounded-md hover:bg-primary/5 hover:underline transition-colors" onClick={(e) => e.stopPropagation()}>
                                <Github className="h-4 w-4" /><span>GitHub</span><ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => handleEditProject(project)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: project.id, name: project.name })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </SelectableTile>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto pb-4">
            <KanbanBoard<ProjectKanbanItem> columns={columns} onMove={handleMove} onReorder={() => {}} renderItem={(item) => <ProjectKanbanCard project={item.project} />} renderOverlay={(item) => <ProjectKanbanCard project={item.project} />} renderEmptyState={() => <span>{t('dragProjectHere')}</span>} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {columns.map((col) => (
              <Card key={col.id}><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{col.items.length}</div><div className="text-sm text-gray-500">{col.title}</div></CardContent></Card>
            ))}
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('dialog.title')}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <ProjectFormFields formData={createForm.formData} onChange={createForm.setFormData} companies={companies} techInput={createForm.techInput} onTechInputChange={createForm.setTechInput} onAddTechnology={createForm.addTechnology} onRemoveTechnology={createForm.removeTechnology} isOngoing={createForm.isOngoing} onOngoingChange={createForm.setIsOngoing} onAddRepository={createForm.addRepository} onRemoveRepository={createForm.removeRepository} onUpdateRepository={createForm.updateRepository} onSetPrimaryRepository={createForm.setPrimaryRepository} githubRepos={isGitHubConnected ? githubRepos : undefined} onRepoSelected={handleRepoSelected} isLoadingRepoInfo={isLoadingRepoInfo} />
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleGenerateAI} disabled={!createForm.formData.git_url || isGeneratingAI} className="ml-auto">
                  {isGeneratingAI ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}{t('dialog.generateAI')}
                </Button>
              </div>
              <p className="text-xs text-gray-500">{t('dialog.aiGenerateHint')}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{tc('cancel')}</Button>
              <Button type="submit" disabled={createMutation.isPending}>{tc('add')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('editDialog.title')}</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <ProjectFormFields formData={editForm.formData} onChange={editForm.setFormData} companies={companies} techInput={editForm.techInput} onTechInputChange={editForm.setTechInput} onAddTechnology={editForm.addTechnology} onRemoveTechnology={editForm.removeTechnology} isOngoing={editForm.isOngoing} onOngoingChange={editForm.setIsOngoing} onAddRepository={editForm.addRepository} onRemoveRepository={editForm.removeRepository} onUpdateRepository={editForm.updateRepository} onSetPrimaryRepository={editForm.setPrimaryRepository} githubRepos={isGitHubConnected ? githubRepos : undefined} onRepoSelected={handleEditRepoSelected} isLoadingRepoInfo={isLoadingRepoInfo} idPrefix="edit_" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProject(null)}>{tc('cancel')}</Button>
              <Link to={`/knowledge/projects/${editingProject?.id}`}><Button type="button" variant="secondary">{t('editDialog.viewDetail')}</Button></Link>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{tc('save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ExportDialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen} />
      <ScrollToTop />

      {/* Delete Dialogs */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle><AlertDialogDescription>{t('deleteDialog.singleDescription', { name: deleteTarget?.name })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null) } }} className="bg-red-600 hover:bg-red-700">{t('deleteDialog.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBatchDeleteDialogOpen} onOpenChange={setIsBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle><AlertDialogDescription>{t('deleteDialog.batchDescription', { count: selection.selectedCount })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { batchDeleteMutation.mutate(selection.getSelectedArray()); setIsBatchDeleteDialogOpen(false) }} className="bg-red-600 hover:bg-red-700">{t('deleteDialog.confirmBatch', { count: selection.selectedCount })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
