import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { ProjectFormFields } from '@/components/ProjectFormFields'
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
  StopCircle,
  Github,
  ExternalLink,
  Star,
  Bot,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from '@/components/ui/popover'
import { ExportDialog } from '@/components/ExportDialog'
import { formatDateTime } from '@/lib/utils'
import { BasicInfoTab, SummaryTab, DetailTab } from './ProjectDetailTabs'
import { useProjectDetail } from './hooks/useProjectDetail'

export default function ProjectDetailPage() {
  const {
    navigate,
    t,
    projectId,
    project,
    analysis,
    final,
    detailed,
    isLoading,
    companies,
    analyzing,
    analysisProgress,
    analysisJob,
    analysisLanguage,
    setAnalysisLanguage,
    handleStartAnalysis,
    handleCancelAnalysis,
    updateContentMutation,
    resetFieldMutation,
    isEditDialogOpen,
    setIsEditDialogOpen,
    editForm,
    openEditDialog,
    handleEditSubmit,
    handleEditRepoSelected,
    updateMutation,
    isGitHubConnected,
    githubRepos,
    isExportDialogOpen,
    setIsExportDialogOpen,
    contributorAnalysisData,
    perRepoData,
  } = useProjectDetail()

  if (isLoading) {
    return <div className="text-center py-8">{t('detail.loading')}</div>
  }

  if (!project) {
    return <div className="text-center py-8">{t('detail.notFound')}</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.short_description && (
              <p className="text-gray-600 mt-1">{project.short_description}</p>
            )}
            {/* Repository links */}
            {project.repositories && project.repositories.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Github className="h-4 w-4 text-gray-500" />
                {project.repositories.map((repo) => (
                  <a
                    key={repo.id || repo.git_url}
                    href={repo.git_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-sm text-primary rounded-md border border-gray-200 hover:bg-primary/5 hover:underline transition-colors"
                  >
                    {repo.label || repo.git_url.split('/').pop()}
                    {repo.is_primary && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
            {/* Progress bar during analysis */}
            {analyzing && analysisJob && (
              <div className="mt-2 flex items-center gap-2">
                <Progress value={analysisProgress} className="h-2 flex-1 max-w-md" />
                <span className="text-xs text-gray-500">
                  {analysisProgress}%
                </span>
              </div>
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
          {(project.git_url || (project.repositories && project.repositories.length > 0)) && (
            <div className="flex items-center gap-2">
              {/* Analysis Language Selector */}
              {!analyzing && (
                <div className="flex items-center gap-1">
                  <Select
                    value={analysisLanguage}
                    onValueChange={(v) => setAnalysisLanguage(v as 'ko' | 'en')}
                  >
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ko">{t('detail.analysisLanguage.korean')}</SelectItem>
                      <SelectItem value="en">{t('detail.analysisLanguage.english')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" className="max-w-xs">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm font-medium">{t('detail.analysisLanguage.helpTitle')}</p>
                        <PopoverClose asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </PopoverClose>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{t('detail.analysisLanguage.helpDescription')}</p>
                      <ul className="text-xs space-y-1 text-muted-foreground">
                        <li>• {t('detail.analysisLanguage.helpPoint1')}</li>
                        <li>• {t('detail.analysisLanguage.helpPoint2')}</li>
                        <li>• {t('detail.analysisLanguage.helpPoint3')}</li>
                      </ul>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {analyzing ? (
                <Button
                  variant="destructive"
                  onClick={handleCancelAnalysis}
                >
                  <StopCircle className="h-4 w-4 mr-2" />
                  {t('backgroundAnalysis.cancel')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleStartAnalysis}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {project.is_analyzed ? t('detail.buttons.reanalyze') : t('detail.buttons.analyzeRepo')}
                </Button>
              )}
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

        {/* Status badges row -- below action buttons */}
        <div className="flex items-center gap-3 pl-14">
          {analyzing ? (
            <Badge className="bg-blue-500 text-white animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              {t('backgroundAnalysis.inProgress')} ({analysisProgress}%)
            </Badge>
          ) : project.is_analyzed ? (
            <>
              <Badge variant="success">{t('detail.badge.analyzed')}</Badge>
              {project.last_analyzed_at && (
                <span className="text-sm text-gray-400">{t('analyzedAt', { date: formatDateTime(project.last_analyzed_at) })}</span>
              )}
            </>
          ) : null}
          {/* AI Tools (Vibe Coding) badges */}
          {project.ai_tools_detected && project.ai_tools_detected.length > 0 && (
            <>
              <Badge className="bg-violet-500 text-white">
                <Bot className="h-3 w-3 mr-1" />
                {t('detail.badge.vibeCoding')}
              </Badge>
              {project.ai_tools_detected.map((tool) => (
                <Badge key={tool.tool} variant="outline" className="text-violet-600 border-violet-300">
                  {tool.tool} ({t('detail.badge.aiToolCommits', { count: tool.count })})
                </Badge>
              ))}
            </>
          )}
        </div>
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

        {/* Tab 1: Basic Info (PROJECT_PERFORMANCE_SUMMARY style) */}
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
            contributorAnalysis={contributorAnalysisData?.data}
            companies={companies}
            perRepoAnalyses={perRepoData?.data}
          />
        </TabsContent>

        {/* Tab 2: Summary (FINAL_PROJECT_REPORT style) */}
        <TabsContent value="summary" className="mt-6 space-y-6">
          <SummaryTab
            project={project}
            analysis={analysis}
            final={final}
            detailed={detailed}
            editStatus={analysis?.edit_status}
            t={t}
            onSaveKeyTasks={async (items) => {
              await updateContentMutation.mutateAsync({ field: 'key_tasks', content: items })
            }}
            onResetKeyTasks={async () => {
              await resetFieldMutation.mutateAsync('key_tasks')
            }}
            contributorAnalysis={contributorAnalysisData?.data}
            perRepoAnalyses={perRepoData?.data}
          />
        </TabsContent>

        {/* Tab 3: Detail (DETAILED_COMPLETION_REPORT style) */}
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
            contributorAnalysis={contributorAnalysisData?.data}
            perRepoAnalyses={perRepoData?.data}
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
            <ProjectFormFields
              formData={editForm.formData}
              onChange={editForm.setFormData}
              companies={companies}
              techInput={editForm.techInput}
              onTechInputChange={editForm.setTechInput}
              onAddTechnology={editForm.addTechnology}
              onRemoveTechnology={editForm.removeTechnology}
              isOngoing={editForm.isOngoing}
              onOngoingChange={editForm.setIsOngoing}
              onAddRepository={editForm.addRepository}
              onRemoveRepository={editForm.removeRepository}
              onUpdateRepository={editForm.updateRepository}
              onSetPrimaryRepository={editForm.setPrimaryRepository}
              githubRepos={isGitHubConnected ? githubRepos : undefined}
              onRepoSelected={handleEditRepoSelected}
              idPrefix="detail_edit_"
            />
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
