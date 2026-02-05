import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { SelectableTile } from '@/components/ui/selectable-tile'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usePipelineStore } from '@/stores/pipelineStore'
import { useAppStore } from '@/stores/appStore'
import { useSelection } from '@/hooks/useSelection'
import { projectsApi } from '@/api/knowledge'
import { templatesApi } from '@/api/templates'
import { pipelineApi, PipelineRunRequest } from '@/api/pipeline'
import { usersApi } from '@/api/users'
import { Play, FolderKanban, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function GeneratePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useUserStore()
  const { setTaskId, setRequest } = usePipelineStore()
  const { isElectronApp, aiMode, selectedCLI, selectedLLMProvider, claudeCodeModel, geminiCLIModel } = useAppStore()
  const selection = useSelection<number>()

  const [templateId, setTemplateId] = useState<string>('')
  const [outputFormat, setOutputFormat] = useState<string>('docx')
  const [documentName, setDocumentName] = useState<string>('')
  const [options, setOptions] = useState({
    includeAchievements: true,
    includeTechStack: true,
  })
  const [optionsLoaded, setOptionsLoaded] = useState(false)

  // Load user's default generation options from settings
  const { data: generationOptionsData } = useQuery({
    queryKey: ['generation-options', user?.id],
    queryFn: () => usersApi.getGenerationOptions(user!.id),
    enabled: !!user?.id,
  })

  // Apply user's default options when loaded
  useEffect(() => {
    if (generationOptionsData?.data && !optionsLoaded) {
      const opts = generationOptionsData.data
      setOutputFormat(opts.default_output_format || 'docx')
      setOptions({
        includeAchievements: opts.default_include_achievements ?? true,
        includeTechStack: opts.default_include_tech_stack ?? true,
      })
      setOptionsLoaded(true)
    }
  }, [generationOptionsData, optionsLoaded])

  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
  })

  const runPipelineMutation = useMutation({
    mutationFn: (data: PipelineRunRequest) => pipelineApi.run(user!.id, data),
    onSuccess: (response) => {
      setTaskId(response.data.task_id)
      toast({ title: t('generate:pipelineStarted') })
      navigate('/generate/pipeline')
    },
    onError: () => toast({ title: t('common:error'), description: t('generate:pipelineFailed'), variant: 'destructive' }),
  })

  const projects = projectsData?.data?.projects || []
  const templates = templatesData?.data?.templates || []

  // Check if any selected project is not analyzed
  const selectedProjects = projects.filter(p => selection.isSelected(p.id))
  const unanalyzedProjects = selectedProjects.filter(p => !p.is_analyzed)
  const hasUnanalyzedProjects = unanalyzedProjects.length > 0

  const handleSubmit = () => {
    if (selection.selectedCount === 0) {
      toast({ title: t('generate:projectSelection'), description: t('generate:selectProjectError'), variant: 'destructive' })
      return
    }
    if (!templateId) {
      toast({ title: t('generate:template'), description: t('generate:selectTemplateError'), variant: 'destructive' })
      return
    }

    // Build LLM/CLI settings based on appStore preferences
    const llmSettings: Pick<PipelineRunRequest, 'llm_provider' | 'cli_mode' | 'cli_model'> = {}
    if (aiMode === 'cli' && isElectronApp) {
      // CLI mode (Electron only)
      llmSettings.cli_mode = selectedCLI
      llmSettings.cli_model = selectedCLI === 'claude_code' ? claudeCodeModel : geminiCLIModel
    } else {
      // API mode
      llmSettings.llm_provider = selectedLLMProvider
    }

    const request: PipelineRunRequest = {
      project_ids: selection.getSelectedArray(),
      template_id: parseInt(templateId),
      output_format: outputFormat,
      document_name: documentName || undefined,
      include_achievements: options.includeAchievements,
      include_tech_stack: options.includeTechStack,
      // Auto-analyze unanalyzed projects before generation
      auto_analyze: hasUnanalyzedProjects,
      ...llmSettings,
    }

    setRequest(request)
    runPipelineMutation.mutate(request)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('generate:title')}</h1>
        <p className="text-muted-foreground">{t('generate:subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project Selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('generate:projectSelection')}</CardTitle>
                <CardDescription>{t('generate:selectProjectsToInclude')}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => selection.toggleAll(projects.map(p => p.id))}>
                {selection.selectedCount === projects.length ? t('generate:deselectAll') : t('generate:selectAll')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('generate:noProjects')}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {projects.map((project) => (
                  <SelectableTile
                    key={project.id}
                    id={project.id}
                    selected={selection.isSelected(project.id)}
                    onSelectChange={() => selection.toggle(project.id)}
                    className="p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{project.name}</span>
                        {project.is_analyzed && <Badge variant="success" className="text-xs">{t('generate:analyzed')}</Badge>}
                        {project.ai_summary && <Badge variant="secondary" className="text-xs">{t('generate:aiSummary')}</Badge>}
                        {!project.is_analyzed && <Badge variant="outline" className="text-xs">{t('generate:notAnalyzed')}</Badge>}
                      </div>
                      {project.short_description && (
                        <p className="text-sm text-muted-foreground truncate">{project.short_description}</p>
                      )}
                      {project.technologies?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {project.technologies.slice(0, 5).map((tech) => (
                            <TechBadge key={tech.id} tech={tech.name} size="sm" />
                          ))}
                          {project.technologies.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{project.technologies.length - 5}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </SelectableTile>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-4">
              {t('generate:projectsSelected', { count: selection.selectedCount })}
            </p>

            {/* Warning for unanalyzed projects */}
            {hasUnanalyzedProjects && (
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('generate:unanalyzedWarning', { count: unanalyzedProjects.length })}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('generate:templateSettings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('generate:template')}</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('generate:selectTemplate')} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id.toString()}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('generate:outputFormat')}</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Word (DOCX)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="md">Markdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('generate:documentName')}</Label>
                <Input
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder={t('generate:autoGenerate')}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('generate:generationOptions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="includeAchievements"
                    checked={options.includeAchievements}
                    onCheckedChange={(c) => setOptions({ ...options, includeAchievements: !!c })}
                  />
                  <Label htmlFor="includeAchievements">{t('generate:options.includeAchievements')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="includeTechStack"
                    checked={options.includeTechStack}
                    onCheckedChange={(c) => setOptions({ ...options, includeTechStack: !!c })}
                  />
                  <Label htmlFor="includeTechStack">{t('generate:options.includeTechStack')}</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={runPipelineMutation.isPending || selection.selectedCount === 0 || !templateId}
          >
            <Play className="h-4 w-4 mr-2" />
            {runPipelineMutation.isPending ? t('generate:generating') : t('generate:startGeneration')}
          </Button>
        </div>
      </div>
    </div>
  )
}
