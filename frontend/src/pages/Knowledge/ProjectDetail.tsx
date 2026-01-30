import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { githubApi } from '@/api/github'
import { reportsApi, type DetailedReportData, type FinalReportData } from '@/api/documents'
import { TechBadge } from '@/components/ui/tech-badge'
import { ScrollToTop } from '@/components/ScrollToTop'
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  FileDown,
  BarChart3,
  ClipboardList,
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
import { BasicInfoTab, SummaryTab, DetailTab } from './ProjectDetailTabs'

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
