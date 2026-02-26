import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { ProjectFormFields } from '@/components/ProjectFormFields'
import { useUserStore } from '@/stores/userStore'
import { companiesApi, CompanySummaryResponse } from '@/api/knowledge'
import { formatDate } from '@/lib/utils'
import { useTimelineProjectCrud } from './hooks/useTimelineProjectCrud'
import {
  Building2,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Users,
  Calendar,
  Code,
  Briefcase,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Link2,
} from 'lucide-react'

function TechCategoryBadges({ techCategories }: { techCategories: Record<string, string[]> }) {
  return (
    <div className="space-y-2">
      {Object.entries(techCategories).map(([category, techs]) => (
        <div key={category} className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-gray-500 w-20">{category}:</span>
          {techs.map((tech) => (
            <TechBadge key={tech} tech={tech} size="sm" />
          ))}
        </div>
      ))}
    </div>
  )
}

function CompanyCard({
  companySummary,
  t,
  isFirst,
  isLast,
  userId,
  onAddProject,
  onLinkProject,
  onEditProject,
  onDeleteProject,
}: {
  companySummary: CompanySummaryResponse
  t: (key: string, options?: any) => string
  isFirst?: boolean
  isLast?: boolean
  userId: number
  onAddProject: (companyId: number) => void
  onLinkProject: (companyId: number) => void
  onEditProject: (projectId: number) => void
  onDeleteProject: (id: number, name: string) => void
}) {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(true)
  const { company, projects, project_count, tech_categories, date_range } = companySummary

  return (
    <div className="relative flex gap-6">
      {/* Timeline marker */}
      <div className="flex flex-col items-center">
        {/* Connector line top */}
        <div className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-primary/30'}`} />

        {/* Timeline dot */}
        <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-4 overflow-hidden ${
          company.is_current
            ? 'bg-primary border-primary/30 text-white'
            : 'bg-white border-primary/30 text-primary'
        }`}>
          {company.logo_path ? (
            <img
              src={companiesApi.getLogoUrl(userId, company.id)}
              alt={company.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Building2 className="h-5 w-5" />
          )}
        </div>

        {/* Connector line bottom */}
        <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-primary/30'}`} />
      </div>

      {/* Company Card */}
      <Card className="flex-1 mb-6 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <CardTitle className="text-xl font-bold">{company.name}</CardTitle>
                {company.is_current && (
                  <Badge variant="success" className="text-xs">
                    {t('current')}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {company.position && (
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Briefcase className="h-4 w-4 text-primary" />
                    {company.position}
                    {company.department && <span className="text-muted-foreground">· {company.department}</span>}
                  </span>
                )}
                {company.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {company.location}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded">
                  <Calendar className="h-3.5 w-3.5" />
                  {date_range}
                </span>
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded">
                  <FolderGit2 className="h-3.5 w-3.5" />
                  {t('timeline.projectsCount', { count: project_count })}
                </span>
              </div>

              {company.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {company.description}
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </Button>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 space-y-6">
            {/* Tech Stack Summary */}
            {Object.keys(tech_categories).length > 0 && (
              <div className="p-4 bg-muted/30 rounded-lg border">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  {t('timeline.techStack')}
                </h4>
                <TechCategoryBadges techCategories={tech_categories} />
              </div>
            )}

            {/* Projects List */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FolderGit2 className="h-4 w-4 text-primary" />
                {t('timeline.keyProjects')}
              </h4>

              <div className="space-y-3">
                {projects.map((project, index) => (
                  <div
                    key={project.id}
                    className="group relative border rounded-lg p-4 hover:bg-accent/50 hover:border-primary/30 cursor-pointer transition-all"
                    onClick={() => navigate(`/knowledge/projects/${project.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Project number */}
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0">
                        {index + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Project header */}
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {project.name}
                          </h5>
                          {project.git_url && (
                            <a
                              href={project.git_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-primary shrink-0"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>

                        {/* Project meta */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(project.start_date)} ~ {formatDate(project.end_date) || t('timeline.ongoing')}
                          </span>
                          {project.team_size && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {t('timeline.teamMembers', { count: project.team_size })}
                            </span>
                          )}
                          {project.role && (
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              {project.role}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {project.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {project.description}
                          </p>
                        )}

                        {/* Technologies */}
                        {project.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {project.technologies.slice(0, 6).map((tech) => (
                              <TechBadge key={tech} tech={tech} size="sm" />
                            ))}
                            {project.technologies.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{project.technologies.length - 6}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Edit / Delete buttons */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditProject(project.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteProject(project.id, project.name)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {projects.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderGit2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('timeline.noProjectsRegistered')}</p>
                  </div>
                )}
              </div>

              {/* Add / Link project buttons */}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onAddProject(company.id)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('timeline.addProject')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onLinkProject(company.id)}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  {t('linkProject')}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

export default function CompanyTimelinePage() {
  const navigate = useNavigate()
  const { t } = useTranslation('companies')
  const { t: tc } = useTranslation('common')
  const { t: tp } = useTranslation('projects')
  const { user } = useUserStore()
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline')

  const { data: groupedData, isLoading } = useQuery({
    queryKey: ['companies-grouped', user?.id],
    queryFn: () => companiesApi.getGroupedByCompany(user!.id),
    enabled: !!user?.id,
  })

  const crud = useTimelineProjectCrud()

  if (!user) return null

  const companySummaries = groupedData?.data?.companies || []
  const totalCompanies = groupedData?.data?.total_companies || 0
  const totalProjects = groupedData?.data?.total_projects || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/knowledge/companies')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('timeline.goBack')}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{t('timeline.title')}</h1>
            <p className="text-gray-600">
              {t('timeline.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalCompanies}</p>
                <p className="text-sm text-gray-500">{t('timeline.totalCompanies')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FolderGit2 className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalProjects}</p>
                <p className="text-sm text-gray-500">{t('timeline.totalProjects')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Code className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(
                    companySummaries.flatMap((cs) => cs.aggregated_tech_stack)
                  ).size}
                </p>
                <p className="text-sm text-gray-500">{t('timeline.totalTechStack')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'timeline' | 'list')}>
        <TabsList>
          <TabsTrigger value="timeline">{t('timelineView')}</TabsTrigger>
          <TabsTrigger value="list">{t('timeline.listView')}</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-6">
          {isLoading ? (
            <div className="text-center py-8">{tc('loading')}</div>
          ) : companySummaries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {t('noCompanies')}
                </h3>
                <p className="text-gray-500 mb-4">{t('timeline.addCompanyFirst')}</p>
                <Button onClick={() => navigate('/knowledge/companies')}>
                  {t('timeline.addCompanyBtn')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-0">
              {companySummaries.map((summary, index) => (
                <CompanyCard
                  key={summary.company.id}
                  companySummary={summary}
                  t={t}
                  isFirst={index === 0}
                  isLast={index === companySummaries.length - 1}
                  userId={user!.id}
                  onAddProject={crud.handleOpenCreate}
                  onLinkProject={crud.handleOpenLink}
                  onEditProject={crud.handleOpenEdit}
                  onDeleteProject={crud.handleOpenDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          {isLoading ? (
            <div className="text-center py-8">{tc('loading')}</div>
          ) : (
            <div className="space-y-4">
              {companySummaries.map((summary) => (
                <Card key={summary.company.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {summary.company.logo_path ? (
                          <img
                            src={companiesApi.getLogoUrl(user!.id, summary.company.id)}
                            alt={summary.company.name}
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <Building2 className="h-5 w-5 text-primary" />
                        )}
                        <div>
                          <h3 className="font-medium">{summary.company.name}</h3>
                          <p className="text-sm text-gray-500">
                            {summary.date_range} | {t('timeline.projectsCount', { count: summary.project_count })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {summary.aggregated_tech_stack.slice(0, 6).map((tech) => (
                          <TechBadge key={tech} tech={tech} size="sm" />
                        ))}
                        {summary.aggregated_tech_stack.length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{summary.aggregated_tech_stack.length - 6}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Project Dialog */}
      <Dialog open={crud.isCreateDialogOpen} onOpenChange={crud.setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tp('dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleCreateSubmit} className="space-y-4">
            <ProjectFormFields
              formData={crud.createForm.formData}
              onChange={crud.createForm.setFormData}
              companies={crud.companies}
              techInput={crud.createForm.techInput}
              onTechInputChange={crud.createForm.setTechInput}
              onAddTechnology={crud.createForm.addTechnology}
              onRemoveTechnology={crud.createForm.removeTechnology}
              isOngoing={crud.createForm.isOngoing}
              onOngoingChange={crud.createForm.setIsOngoing}
              onAddRepository={crud.createForm.addRepository}
              onRemoveRepository={crud.createForm.removeRepository}
              onUpdateRepository={crud.createForm.updateRepository}
              onSetPrimaryRepository={crud.createForm.setPrimaryRepository}
              githubRepos={crud.githubRepos}
              onRepoSelected={(url) => crud.handleRepoSelected(url, crud.createForm)}
              isLoadingRepoInfo={crud.isLoadingRepoInfo}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => crud.setIsCreateDialogOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={crud.createMutation.isPending}>
                {tc('add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={!!crud.editingProjectId} onOpenChange={(open) => !open && crud.setEditingProjectId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tp('editDialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleEditSubmit} className="space-y-4">
            <ProjectFormFields
              formData={crud.editForm.formData}
              onChange={crud.editForm.setFormData}
              companies={crud.companies}
              techInput={crud.editForm.techInput}
              onTechInputChange={crud.editForm.setTechInput}
              onAddTechnology={crud.editForm.addTechnology}
              onRemoveTechnology={crud.editForm.removeTechnology}
              isOngoing={crud.editForm.isOngoing}
              onOngoingChange={crud.editForm.setIsOngoing}
              onAddRepository={crud.editForm.addRepository}
              onRemoveRepository={crud.editForm.removeRepository}
              onUpdateRepository={crud.editForm.updateRepository}
              onSetPrimaryRepository={crud.editForm.setPrimaryRepository}
              githubRepos={crud.githubRepos}
              onRepoSelected={(url) => crud.handleRepoSelected(url, crud.editForm)}
              isLoadingRepoInfo={crud.isLoadingRepoInfo}
              idPrefix="timeline_edit_"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => crud.setEditingProjectId(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={crud.updateMutation.isPending}>
                {tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!crud.deleteTarget} onOpenChange={(open) => !open && crud.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tp('deleteDialog.singleDescription', { name: crud.deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (crud.deleteTarget) crud.deleteMutation.mutate(crud.deleteTarget.id)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {tp('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Project Dialog */}
      <Dialog open={crud.isLinkDialogOpen} onOpenChange={crud.setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('linkProjectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('selectProject')}</Label>
              <Select value={crud.selectedProjectId} onValueChange={crud.setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {crud.getUnlinkedProjects().map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                      {project.start_date && ` (${formatDate(project.start_date)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {crud.getUnlinkedProjects().length === 0 && (
                <p className="text-sm text-muted-foreground">{t('noUnlinkedProjects')}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => crud.setIsLinkDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={crud.handleLinkProject}
              disabled={!crud.selectedProjectId || crud.linkProjectMutation.isPending}
            >
              {t('link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
