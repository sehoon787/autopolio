import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { projectsApi, companiesApi, type ProjectCreate } from '@/api/knowledge'
import { githubApi, type EffectiveRepoAnalysis, type EditStatus } from '@/api/github'
import { reportsApi, type DetailedReportData, type FinalReportData } from '@/api/documents'
import { formatDate } from '@/lib/utils'
import { ScrollToTop } from '@/components/ScrollToTop'
import { EditableList } from '@/components/EditableList'
import { EditableStructuredList, type StructuredItem } from '@/components/EditableStructuredList'
import {
  ArrowLeft,
  Github,
  ExternalLink,
  RefreshCw,
  Trophy,
  Code,
  GitCommit,
  FileText,
  FileDown,
  BarChart3,
  ClipboardList,
  Sparkles,
  Pencil,
  HelpCircle,
  X,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from '@/components/ui/popover'
import { ExportDialog } from '@/components/ExportDialog'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation('projects')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const { isElectronApp, aiMode, selectedCLI, selectedLLMProvider, claudeCodeModel, geminiCLIModel } = useAppStore()

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState<Partial<ProjectCreate>>({})
  const [techInput, setTechInput] = useState('')
  const [isOngoing, setIsOngoing] = useState(false)

  const projectId = parseInt(id || '0')

  // Fetch companies for edit form
  const { data: companiesData } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: () => companiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const companies = companiesData?.data || []

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getById(projectId),
    enabled: !!projectId,
  })

  // Use effective analysis (with user edits applied)
  const { data: analysisData } = useQuery({
    queryKey: ['repo-analysis-effective', projectId],
    queryFn: () => githubApi.getEffectiveAnalysis(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  // Mutation for updating analysis content
  const updateContentMutation = useMutation({
    mutationFn: ({ field, content }: { field: 'key_tasks' | 'implementation_details' | 'detailed_achievements', content: any }) =>
      githubApi.updateAnalysisContent(projectId, { field, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-analysis-effective', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })
      toast({ title: t('detail.toast.saveSuccess'), description: t('detail.toast.saveSuccessDesc') })
    },
    onError: (error: any) => {
      toast({
        title: t('detail.toast.saveFailed'),
        description: error?.response?.data?.detail || t('detail.toast.saveFailedDesc'),
        variant: 'destructive'
      })
    },
  })

  // Mutation for resetting analysis field
  const resetFieldMutation = useMutation({
    mutationFn: (field: string) => githubApi.resetAnalysisField(projectId, field),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-analysis-effective', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })
      toast({ title: t('detail.toast.resetSuccess'), description: t('detail.toast.resetSuccessDesc') })
    },
    onError: (error: any) => {
      toast({
        title: t('detail.toast.resetFailed'),
        description: error?.response?.data?.detail || t('detail.toast.resetFailedDesc'),
        variant: 'destructive'
      })
    },
  })

  // Fetch report data for tabs
  const { data: finalReport } = useQuery({
    queryKey: ['report-final', projectId],
    queryFn: () => reportsApi.getFinalReport(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  const { data: detailedReport } = useQuery({
    queryKey: ['report-detailed', projectId],
    queryFn: () => reportsApi.getDetailedReport(projectId),
    enabled: !!projectId && !!projectData?.data?.is_analyzed,
  })

  const analyzeMutation = useMutation({
    mutationFn: () => {
      // Build LLM/CLI options based on aiMode
      const options: Parameters<typeof githubApi.analyzeRepo>[3] = {}

      console.log('[Analyze] aiMode:', aiMode, 'isElectronApp:', isElectronApp, 'selectedCLI:', selectedCLI)

      if (aiMode === 'cli' && isElectronApp) {
        // CLI mode (Electron only)
        options.cli_mode = selectedCLI
        options.cli_model = selectedCLI === 'claude_code' ? claudeCodeModel : geminiCLIModel
        console.log('[Analyze] Using CLI mode:', options.cli_mode, 'model:', options.cli_model)
      } else {
        // API mode
        options.provider = selectedLLMProvider
        console.log('[Analyze] Using API mode, provider:', options.provider)
      }

      return githubApi.analyzeRepo(user!.id, project!.git_url!, project!.id, options)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['repo-analysis-effective', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-summary', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-final', projectId] })
      queryClient.invalidateQueries({ queryKey: ['report-detailed', projectId] })
      toast({ title: t('detail.toast.analyzeSuccess'), description: t('detail.toast.analyzeSuccessDesc') })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || t('detail.toast.analyzeFailedDesc')
      toast({
        title: t('detail.toast.analyzeFailed'),
        description: errorMessage,
        variant: 'destructive'
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ProjectCreate>) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsEditDialogOpen(false)
      toast({ title: t('detail.toast.updateSuccess') })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || t('detail.toast.updateFailedDesc')
      toast({ title: t('detail.toast.updateFailed'), description: errorMessage, variant: 'destructive' })
    },
  })

  // Open edit dialog with current project data
  const openEditDialog = () => {
    if (!project) return
    setEditFormData({
      name: project.name,
      short_description: project.short_description || '',
      description: project.description || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      team_size: project.team_size || undefined,
      role: project.role || '',
      contribution_percent: project.contribution_percent || undefined,
      git_url: project.git_url || '',
      project_type: project.project_type || 'personal',
      company_id: project.company_id || undefined,
      technologies: project.technologies?.map((t: any) => t.name) || [],
    })
    setIsOngoing(!project.end_date)
    setTechInput('')
    setIsEditDialogOpen(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanedData: Partial<ProjectCreate> = {
      name: editFormData.name,
      short_description: editFormData.short_description || undefined,
      description: editFormData.description || undefined,
      start_date: editFormData.start_date || undefined,
      end_date: editFormData.end_date || undefined,
      team_size: editFormData.team_size,
      role: editFormData.role || undefined,
      contribution_percent: editFormData.contribution_percent,
      git_url: editFormData.git_url || undefined,
      project_type: editFormData.project_type || undefined,
      company_id: editFormData.company_id,
      technologies: editFormData.technologies,
    }
    updateMutation.mutate(cleanedData)
  }

  const addTechnology = () => {
    if (techInput.trim() && !editFormData.technologies?.includes(techInput.trim())) {
      setEditFormData({
        ...editFormData,
        technologies: [...(editFormData.technologies || []), techInput.trim()],
      })
      setTechInput('')
    }
  }

  const removeTechnology = (tech: string) => {
    setEditFormData({
      ...editFormData,
      technologies: editFormData.technologies?.filter((t) => t !== tech),
    })
  }

  const project = projectData?.data
  const analysis = analysisData?.data
  const final = finalReport?.data as FinalReportData | undefined
  const detailed = detailedReport?.data as DetailedReportData | undefined

  if (isLoading) {
    return <div className="text-center py-8">{t('detail.loading')}</div>
  }

  if (!project) {
    return <div className="text-center py-8">{t('detail.notFound')}</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.is_analyzed && <Badge variant="success">{t('detail.badge.analyzed')}</Badge>}
          </div>
          {project.short_description && (
            <p className="text-gray-600 mt-1">{project.short_description}</p>
          )}
        </div>
        <Button variant="outline" onClick={openEditDialog}>
          <Pencil className="h-4 w-4 mr-2" />
          {t('detail.buttons.edit')}
        </Button>
        {project.is_analyzed && (
          <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>
            <FileDown className="h-4 w-4 mr-2" />
            {t('detail.buttons.export')}
          </Button>
        )}
        {project.git_url && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
              {project.is_analyzed ? t('detail.buttons.reanalyze') : t('detail.buttons.analyzeRepo')}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" className="max-w-xs">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-medium">{t('detail.analyzeHelp.description')}</p>
                  <PopoverClose asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-2">
                      <X className="h-3 w-3" />
                    </Button>
                  </PopoverClose>
                </div>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• {t('detail.analyzeHelp.point1')}</li>
                  <li>• {t('detail.analyzeHelp.point2')}</li>
                  <li>• {t('detail.analyzeHelp.point3')}</li>
                </ul>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* 3-Tab Structure */}
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {t('detail.tabs.basic')}
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('detail.tabs.summary')}
          </TabsTrigger>
          <TabsTrigger value="detail" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('detail.tabs.detail')}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 기본정보 (PROJECT_PERFORMANCE_SUMMARY style) */}
        <TabsContent value="basic" className="mt-6 space-y-6">
          <BasicInfoTab
            project={project}
            analysis={analysis}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveKeyTasks={async (items) => {
              await updateContentMutation.mutateAsync({ field: 'key_tasks', content: items })
            }}
            onResetKeyTasks={async () => {
              await resetFieldMutation.mutateAsync('key_tasks')
            }}
          />
        </TabsContent>

        {/* Tab 2: 분석 요약 (FINAL_PROJECT_REPORT style) */}
        <TabsContent value="summary" className="mt-6 space-y-6">
          <SummaryTab
            project={project}
            analysis={analysis}
            final={final}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveKeyTasks={async (items) => {
              await updateContentMutation.mutateAsync({ field: 'key_tasks', content: items })
            }}
            onResetKeyTasks={async () => {
              await resetFieldMutation.mutateAsync('key_tasks')
            }}
          />
        </TabsContent>

        {/* Tab 3: 상세 분석 (DETAILED_COMPLETION_REPORT style) */}
        <TabsContent value="detail" className="mt-6 space-y-6">
          <DetailTab
            project={project}
            analysis={analysis}
            detailed={detailed}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveImplementationDetails={async (sections) => {
              await updateContentMutation.mutateAsync({ field: 'implementation_details', content: sections })
            }}
            onResetImplementationDetails={async () => {
              await resetFieldMutation.mutateAsync('implementation_details')
            }}
            onSaveDetailedAchievements={async (achievements) => {
              await updateContentMutation.mutateAsync({ field: 'detailed_achievements', content: achievements })
            }}
            onResetDetailedAchievements={async () => {
              await resetFieldMutation.mutateAsync('detailed_achievements')
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('detail.editDialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('detail.editDialog.projectName')}</Label>
              <Input
                id="edit-name"
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
              />
              <p className="text-xs text-gray-500">
                {t('detail.editDialog.projectNameHint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-short_description">{t('detail.editDialog.shortDesc')}</Label>
              <Input
                id="edit-short_description"
                value={editFormData.short_description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, short_description: e.target.value })}
                placeholder={t('detail.editDialog.shortDescPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('detail.editDialog.projectType')}</Label>
                <Select
                  value={editFormData.project_type || 'personal'}
                  onValueChange={(v) => setEditFormData({ ...editFormData, project_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">{t('detail.editDialog.companyProject')}</SelectItem>
                    <SelectItem value="personal">{t('detail.editDialog.personalProject')}</SelectItem>
                    <SelectItem value="open-source">{t('detail.editDialog.openSource')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('detail.editDialog.company')}</Label>
                <Select
                  value={editFormData.company_id?.toString() || 'none'}
                  onValueChange={(v) => setEditFormData({ ...editFormData, company_id: v === 'none' ? undefined : parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('detail.editDialog.selectOptional')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('detail.editDialog.none')}</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-start_date">{t('detail.editDialog.startDate')}</Label>
                <Input
                  id="edit-start_date"
                  type="date"
                  value={editFormData.start_date || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end_date">{t('detail.editDialog.endDate')}</Label>
                <Input
                  id="edit-end_date"
                  type="date"
                  value={editFormData.end_date || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                  disabled={isOngoing}
                  className={isOngoing ? 'bg-gray-100 cursor-not-allowed' : ''}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-is_ongoing"
                checked={isOngoing}
                onChange={(e) => {
                  setIsOngoing(e.target.checked)
                  if (e.target.checked) {
                    setEditFormData({ ...editFormData, end_date: '' })
                  }
                }}
              />
              <Label htmlFor="edit-is_ongoing" className="cursor-pointer">{t('detail.editDialog.ongoingProject')}</Label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-role">{t('detail.editDialog.role')}</Label>
                <Input
                  id="edit-role"
                  value={editFormData.role || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  placeholder={t('detail.editDialog.rolePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-team_size">{t('detail.editDialog.teamSize')}</Label>
                <Input
                  id="edit-team_size"
                  type="number"
                  value={editFormData.team_size || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, team_size: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contribution_percent">{t('detail.editDialog.contribution')}</Label>
                <Input
                  id="edit-contribution_percent"
                  type="number"
                  min="0"
                  max="100"
                  value={editFormData.contribution_percent || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, contribution_percent: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="70"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-git_url">{t('detail.editDialog.githubUrl')}</Label>
              <Input
                id="edit-git_url"
                value={editFormData.git_url || ''}
                onChange={(e) => setEditFormData({ ...editFormData, git_url: e.target.value })}
                placeholder="https://github.com/username/repo"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('detail.editDialog.techStack')}</Label>
              <div className="flex gap-2">
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  placeholder={t('detail.editDialog.techInputPlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTechnology()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTechnology}>
                  {t('detail.buttons.add')}
                </Button>
              </div>
              {editFormData.technologies && editFormData.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {editFormData.technologies.map((tech) => (
                    <TechBadge
                      key={tech}
                      tech={tech}
                      className="cursor-pointer hover:opacity-80"
                      onClick={() => removeTechnology(tech)}
                    />
                  ))}
                  <span className="text-xs text-gray-500 self-center ml-1">{t('detail.editDialog.clickToRemove')}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('detail.editDialog.description')}</Label>
              <Textarea
                id="edit-description"
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                {t('detail.buttons.cancel')}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t('detail.buttons.saving') : t('detail.buttons.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        projectId={projectId}
        projectName={project.name}
      />

      <ScrollToTop />
    </div>
  )
}

// Tab 1: 기본정보
interface BasicInfoTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  editStatus?: EditStatus
  t: (key: string, options?: any) => string
  onSaveKeyTasks: (items: string[]) => Promise<void>
  onResetKeyTasks: () => Promise<void>
}

function BasicInfoTab({ project, analysis, editStatus, t, onSaveKeyTasks, onResetKeyTasks }: BasicInfoTabProps) {
  const [isEditingKeyTasks, setIsEditingKeyTasks] = useState(false)

  return (
    <>
      {/* 프로젝트 정보 & 기술 스택 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {t('detail.basicInfo.projectInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm text-gray-500">{t('detail.basicInfo.period')}</span>
              <p>
                {formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : t('detail.basicInfo.ongoing')}
              </p>
            </div>
            {project.role && (
              <div>
                <span className="text-sm text-gray-500">{t('detail.basicInfo.role')}</span>
                <p>{project.role}</p>
              </div>
            )}
            {project.team_size && (
              <div>
                <span className="text-sm text-gray-500">{t('detail.basicInfo.teamSize')}</span>
                <p>{t('detail.basicInfo.teamSizeValue', { count: project.team_size })}</p>
              </div>
            )}
            {project.git_url && (
              <div>
                <span className="text-sm text-gray-500">GitHub</span>
                <a
                  href={project.git_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  <Github className="h-4 w-4" />
                  {project.git_url.replace('https://github.com/', '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('detail.basicInfo.techStack')}</CardTitle>
          </CardHeader>
          <CardContent>
            {project.technologies?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {project.technologies.map((tech: any) => (
                  <TechBadge key={tech.id} tech={tech.name} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500">{t('detail.basicInfo.noTechStack')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 주요 수행 업무 (인라인 편집 가능) */}
      {project.is_analyzed && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              {t('detail.basicInfo.keyTasks')}
              {editStatus?.key_tasks_modified && (
                <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs ml-2">
                  {t('detail.badge.modified')}
                </Badge>
              )}
            </CardTitle>
            {!isEditingKeyTasks && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingKeyTasks(true)}
                className="h-8 text-gray-500 hover:text-gray-700"
              >
                <Pencil className="h-4 w-4 mr-1" />
                {t('detail.buttons.editBtn')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <EditableList
              items={analysis?.key_tasks || []}
              onSave={async (items) => {
                await onSaveKeyTasks(items)
                setIsEditingKeyTasks(false)
              }}
              onReset={async () => {
                await onResetKeyTasks()
                setIsEditingKeyTasks(false)
              }}
              isModified={editStatus?.key_tasks_modified || false}
              emptyMessage={t('detail.basicInfo.noKeyTasks')}
              itemPrefix="(n)"
              isEditing={isEditingKeyTasks}
              onEditingChange={setIsEditingKeyTasks}
              hideEditButton
              translations={{
                modified: t('detail.editor.modified'),
                editBtn: t('detail.buttons.editBtn'),
                cancel: t('detail.buttons.cancel'),
                save: t('detail.buttons.save'),
                resetToOriginal: t('detail.buttons.resetToOriginal'),
                newItemPlaceholder: t('detail.editor.newItemPlaceholder'),
                addItem: t('detail.buttons.addItem'),
                noItems: t('detail.editor.noItems'),
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* 성과 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {t('detail.basicInfo.achievements')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.achievements?.length > 0 ? (
            <div className="space-y-4">
              {project.achievements.map((achievement: any) => (
                <div key={achievement.id} className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-100">
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 rounded-full p-2 mt-0.5">
                      <Trophy className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{achievement.metric_name}</h4>
                      {achievement.description && (
                        <p className="text-gray-600 mt-1 text-sm">{achievement.description}</p>
                      )}
                      {achievement.metric_value && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-amber-600 font-medium">▶</span>
                          <span className="text-lg font-bold text-amber-700">{achievement.metric_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Trophy className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>{t('detail.basicInfo.noAchievements')}</p>
              <p className="text-sm mt-1">{t('detail.basicInfo.analyzeForAchievements')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 커밋/코드 통계 */}
      {project.is_analyzed && analysis && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCommit className="h-5 w-5" />
                {t('detail.basicInfo.commitStats')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-3">
                  <span className="text-sm text-blue-600">{t('detail.basicInfo.totalCommits')}</span>
                  <p className="text-2xl font-bold text-blue-700">{analysis.total_commits}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <span className="text-sm text-green-600">{t('detail.basicInfo.myCommits')}</span>
                  <p className="text-2xl font-bold text-green-700">{analysis.user_commits}</p>
                </div>
              </div>
              {analysis.total_commits > 0 && analysis.user_commits > 0 && (
                <div className="text-sm text-gray-600">
                  {t('detail.basicInfo.contribution')}: <span className="font-semibold">{((analysis.user_commits / analysis.total_commits) * 100).toFixed(1)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {t('detail.basicInfo.codeStats')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-emerald-600">{t('detail.basicInfo.added')}</span>
                  <p className="text-lg font-bold text-emerald-700">+{analysis.lines_added?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-red-600">{t('detail.basicInfo.deleted')}</span>
                  <p className="text-lg font-bold text-red-700">-{analysis.lines_deleted?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-purple-600">{t('detail.basicInfo.files')}</span>
                  <p className="text-lg font-bold text-purple-700">{analysis.files_changed?.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Not Analyzed State */}
      {!project.is_analyzed && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Code className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('detail.basicInfo.notAnalyzed')}</h3>
            <p className="text-gray-500 mb-4 text-center">
              {project.git_url
                ? t('detail.basicInfo.notAnalyzedDescWithUrl')
                : t('detail.basicInfo.notAnalyzedDescWithoutUrl')}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}

// Tab 2: 분석 요약
interface SummaryTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  final: FinalReportData | undefined
  editStatus?: EditStatus
  t: (key: string, options?: any) => string
  onSaveKeyTasks: (items: string[]) => Promise<void>
  onResetKeyTasks: () => Promise<void>
}

function SummaryTab({ project, analysis, final, editStatus, t, onSaveKeyTasks, onResetKeyTasks }: SummaryTabProps) {
  const [isEditingKeyTasks, setIsEditingKeyTasks] = useState(false)

  if (!project.is_analyzed || !analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('detail.summary.noData')}</h3>
          <p className="text-gray-500 text-center">{t('detail.summary.noDataDesc')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* 프로젝트 개요 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.summary.overview')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">{t('detail.summary.periodLabel')}</span>{' '}
              <span className="font-medium">
                {final?.overview?.date_range || `${formatDate(project.start_date)} ~ ${project.end_date ? formatDate(project.end_date) : t('detail.basicInfo.ongoing')}`}
              </span>
            </div>
            <div>
              <span className="text-gray-500">{t('detail.summary.companyLabel')}</span>{' '}
              <span className="font-medium">{final?.overview?.company || t('detail.summary.freelancer')}</span>
            </div>
            <div>
              <span className="text-gray-500">{t('detail.summary.roleLabel')}</span>{' '}
              <span className="font-medium">{final?.overview?.role || project.role || t('detail.summary.developer')}</span>
            </div>
            {(project.team_size || final?.overview?.team_size) && (
              <div>
                <span className="text-gray-500">{t('detail.summary.teamSizeLabel')}</span>{' '}
                <span className="font-medium">{t('detail.summary.teamSizeValue', { count: final?.overview?.team_size || project.team_size })}</span>
              </div>
            )}
          </div>
          <div className="pt-2">
            <span className="text-gray-500 text-sm">{t('detail.summary.techStackLabel')}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {(final?.technologies || project.technologies?.map((tech: any) => tech.name) || []).map((tech: string) => (
                <TechBadge key={tech} tech={tech} size="sm" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 주요 구현 내용 (인라인 편집 가능) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            {t('detail.summary.keyImplementations')}
            {editStatus?.key_tasks_modified && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs ml-2">
                {t('detail.badge.modified')}
              </Badge>
            )}
          </CardTitle>
          {!isEditingKeyTasks && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingKeyTasks(true)}
              className="h-8 text-gray-500 hover:text-gray-700"
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t('detail.buttons.editBtn')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <EditableList
            items={analysis?.key_tasks || []}
            onSave={async (items) => {
              await onSaveKeyTasks(items)
              setIsEditingKeyTasks(false)
            }}
            onReset={async () => {
              await onResetKeyTasks()
              setIsEditingKeyTasks(false)
            }}
            isModified={editStatus?.key_tasks_modified || false}
            emptyMessage={t('detail.summary.noKeyImplementations')}
            itemPrefix="•"
            isEditing={isEditingKeyTasks}
            onEditingChange={setIsEditingKeyTasks}
            hideEditButton
            translations={{
              modified: t('detail.editor.modified'),
              editBtn: t('detail.buttons.editBtn'),
              cancel: t('detail.buttons.cancel'),
              save: t('detail.buttons.save'),
              resetToOriginal: t('detail.buttons.resetToOriginal'),
              newItemPlaceholder: t('detail.editor.newItemPlaceholder'),
              addItem: t('detail.buttons.addItem'),
              noItems: t('detail.editor.noItems'),
            }}
          />
        </CardContent>
      </Card>

      {/* 기술 스택 (버전 포함) - 상세 분석에서 가져옴 */}
      {analysis?.tech_stack_versions && Object.keys(analysis.tech_stack_versions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-green-500" />
              {t('detail.summary.techStackVersions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(analysis.tech_stack_versions as Record<string, string[]>).map(([category, techs]) => (
              <div key={category}>
                <p className="font-medium text-sm text-gray-500 mb-1">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {techs.map((tech: string, idx: number) => (
                    <TechBadge key={idx} tech={tech} size="sm" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 성과 */}
      {(final?.achievements?.length || project.achievements?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.summary.achievements')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(final?.achievements || project.achievements || []).map((ach: any, index: number) => (
              <div key={index} className="border-l-4 border-amber-400 pl-4 py-2">
                <div className="font-semibold text-gray-900">[ {ach.metric_name} ]</div>
                {ach.description && <p className="text-sm text-gray-600 mt-1">{ach.description}</p>}
                {ach.metric_value && (
                  <div className="text-amber-600 font-medium mt-1">▶ {ach.metric_value}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* 코드 기여도 */}
      {(final?.code_contribution || analysis) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.summary.codeContribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="text-emerald-600 text-sm">{t('detail.summary.addedCode')}</div>
                <div className="text-xl font-bold text-emerald-700">
                  +{(final?.code_contribution?.lines_added || analysis?.lines_added || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-red-600 text-sm">{t('detail.summary.deletedCode')}</div>
                <div className="text-xl font-bold text-red-700">
                  -{(final?.code_contribution?.lines_deleted || analysis?.lines_deleted || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-blue-600 text-sm">{t('detail.summary.commits')}</div>
                <div className="text-xl font-bold text-blue-700">
                  {(final?.code_contribution?.commits || analysis?.user_commits || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-purple-600 text-sm">{t('detail.summary.contribution')}</div>
                <div className="text-xl font-bold text-purple-700">
                  {(final?.code_contribution?.contribution_percent ||
                    (analysis?.total_commits > 0 ? ((analysis?.user_commits / analysis?.total_commits) * 100).toFixed(1) : 0))}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 요약 */}
      {(project.ai_summary || final?.ai_summary?.summary) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {t('detail.summary.aiSummary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{final?.ai_summary?.summary || project.ai_summary}</p>
            {(final?.ai_summary?.key_features?.length || project.ai_key_features?.length) ? (
              <div>
                <span className="text-sm text-gray-500">{t('detail.summary.keyFeatures')}</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {(final?.ai_summary?.key_features || project.ai_key_features || []).map((feature: string, index: number) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )
}

// Tab 3: 상세 분석
interface DetailTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  detailed: DetailedReportData | undefined
  editStatus?: EditStatus
  onSaveImplementationDetails: (sections: StructuredItem[]) => Promise<void>
  onResetImplementationDetails: () => Promise<void>
  onSaveDetailedAchievements?: (achievements: Record<string, any>) => Promise<void>
  onResetDetailedAchievements?: () => Promise<void>
  t: (key: string, options?: any) => string
}

function DetailTab({
  project,
  analysis,
  detailed,
  editStatus,
  onSaveImplementationDetails,
  onResetImplementationDetails,
  t,
}: DetailTabProps) {
  const [isEditingImplementationDetails, setIsEditingImplementationDetails] = useState(false)

  if (!project.is_analyzed || !analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('detail.detailTab.noData')}</h3>
          <p className="text-gray-500 text-center">{t('detail.detailTab.noDataDesc')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* 주요 구현 기능 (인라인 편집 가능) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {t('detail.detailTab.keyFeatures')}
            {editStatus?.implementation_details_modified && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs ml-2">
                {t('detail.badge.modified')}
              </Badge>
            )}
          </CardTitle>
          {!isEditingImplementationDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingImplementationDetails(true)}
              className="h-8 text-gray-500 hover:text-gray-700"
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t('detail.buttons.editBtn')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <EditableStructuredList
            sections={analysis?.implementation_details || []}
            onSave={async (sections) => {
              await onSaveImplementationDetails(sections)
              setIsEditingImplementationDetails(false)
            }}
            onReset={async () => {
              await onResetImplementationDetails()
              setIsEditingImplementationDetails(false)
            }}
            isModified={editStatus?.implementation_details_modified || false}
            emptyMessage={t('detail.detailTab.noKeyFeatures')}
            isEditing={isEditingImplementationDetails}
            onEditingChange={setIsEditingImplementationDetails}
            hideEditButton
            translations={{
              modified: t('detail.editor.modified'),
              editBtn: t('detail.buttons.editBtn'),
              cancel: t('detail.buttons.cancel'),
              save: t('detail.buttons.save'),
              resetToOriginal: t('detail.buttons.resetToOriginal'),
              sectionTitlePlaceholder: t('detail.editor.sectionTitlePlaceholder'),
              itemPlaceholder: t('detail.editor.itemPlaceholder'),
              addItemBtn: t('detail.editor.addItemBtn'),
              addSection: t('detail.buttons.addSection'),
              noItems: t('detail.editor.noItems'),
            }}
          />
        </CardContent>
      </Card>

      {/* 개발 타임라인 (LLM-generated) */}
      {detailed?.development_timeline && detailed.development_timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-blue-500" />
              {t('detail.detailTab.devTimeline')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailed.development_timeline.map((phase, idx) => (
              <div key={idx} className="border-l-2 border-blue-400 pl-4 pb-4 last:pb-0">
                <p className="font-semibold text-blue-600 text-sm">{phase.period}</p>
                <p className="font-medium text-gray-900 mt-1">{phase.title}</p>
                <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                  {phase.activities.map((activity, actIdx) => (
                    <li key={actIdx}>{activity}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 기술 스택 (버전 포함) */}
      {detailed?.tech_stack_versions && Object.keys(detailed.tech_stack_versions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-green-500" />
              {t('detail.detailTab.techStackVersions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(detailed.tech_stack_versions).map(([category, techs]) => (
              <div key={category}>
                <p className="font-medium text-sm text-gray-500 mb-2">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {techs.map((tech, idx) => (
                    <TechBadge key={idx} tech={tech} size="sm" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 상세 성과 (카테고리별, LLM-generated) */}
      {detailed?.detailed_achievements && Object.keys(detailed.detailed_achievements).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              {t('detail.detailTab.achievementsByCategory')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(detailed.detailed_achievements).map(([category, achievements]) => (
              achievements.length > 0 && (
                <div key={category}>
                  <h4 className="font-semibold text-primary mb-2">{category}</h4>
                  <div className="space-y-2 ml-4">
                    {achievements.map((ach, idx) => (
                      <div key={idx} className="border-l-2 border-amber-300 pl-3">
                        <p className="font-medium text-gray-900">{ach.title}</p>
                        <p className="text-sm text-gray-600">{ach.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </CardContent>
        </Card>
      )}

      {/* 저장소 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.detailTab.repoInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.repository')}</span>
            <span className="font-medium">{detailed?.repository?.name || project.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.github')}</span>
            <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              {project.git_url?.replace('https://github.com/', '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.totalCommits')}</span>
            <span className="font-medium">{t('detail.detailTab.countCommits', { count: detailed?.repository?.total_commits || analysis.total_commits })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.codeChanges')}</span>
            <span className="font-medium">
              <span className="text-emerald-600">+{(detailed?.repository?.lines_added || analysis.lines_added || 0).toLocaleString()}</span>
              {' / '}
              <span className="text-red-600">-{(detailed?.repository?.lines_deleted || analysis.lines_deleted || 0).toLocaleString()}</span>
            </span>
          </div>
          {detailed?.repository?.analyzed_at && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('detail.detailTab.analysisTime')}</span>
              <span className="font-medium">{detailed.repository.analyzed_at}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 커밋 상세 분석 & 코드 상세 분석 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="h-5 w-5" />
              {t('detail.detailTab.commitAnalysis')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.totalCommitsLabel')}</span>
                <span className="font-medium">{detailed?.commit_analysis?.total_commits || analysis.total_commits}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.myCommitsLabel')}</span>
                <span className="font-medium">
                  {detailed?.commit_analysis?.user_commits || analysis.user_commits} ({detailed?.commit_analysis?.contribution_percent || ((analysis.user_commits / analysis.total_commits) * 100).toFixed(1)}%)
                </span>
              </div>
              {analysis.commit_categories && Object.keys(analysis.commit_categories).length > 0 && (
                <>
                  {Object.entries(analysis.commit_categories).map(([category, count]) => (
                    <div key={category} className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">{category}</span>
                      <span className="font-medium">{count as number}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              {t('detail.detailTab.codeAnalysis')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.addedLines')}</span>
                <span className="font-medium text-emerald-600">+{(detailed?.code_analysis?.lines_added || analysis.lines_added || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.deletedLines')}</span>
                <span className="font-medium text-red-600">-{(detailed?.code_analysis?.lines_deleted || analysis.lines_deleted || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.netChange')}</span>
                <span className="font-medium text-blue-600">
                  {((detailed?.code_analysis?.net_change || (analysis.lines_added || 0) - (analysis.lines_deleted || 0)) > 0 ? '+' : '')}
                  {(detailed?.code_analysis?.net_change || (analysis.lines_added || 0) - (analysis.lines_deleted || 0)).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.changedFiles')}</span>
                <span className="font-medium">{detailed?.code_analysis?.files_changed || analysis.files_changed || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 언어 분석 */}
      {analysis.languages && Object.keys(analysis.languages).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.detailTab.languageAnalysis')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(detailed?.languages || Object.entries(analysis.languages)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 6)
                .map(([lang, percent]) => ({ name: lang, percent: percent as number })))
                .map((lang: any) => (
                  <div key={lang.name} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium">{lang.name}</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-full h-2.5"
                        style={{ width: `${lang.percent}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-14 text-right font-medium">
                      {lang.percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 아키텍처 패턴 */}
      {(detailed?.architecture_patterns?.length || analysis.architecture_patterns?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.detailTab.architecturePatterns')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(detailed?.architecture_patterns || analysis.architecture_patterns || []).map((pattern: string) => (
                <Badge key={pattern} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {pattern}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 커밋 메시지 요약 */}
      {(detailed?.commit_analysis?.messages_summary || analysis.commit_messages_summary) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.detailTab.commitMessagesSummary')}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border">
              {detailed?.commit_analysis?.messages_summary || analysis.commit_messages_summary}
            </pre>
          </CardContent>
        </Card>
      )}
    </>
  )
}
