import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { templatesApi, FieldInfo } from '@/api/templates'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import {
  FullScreenDialog,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogFooter,
  FullScreenDialogTitle,
} from '@/components/ui/full-screen-dialog'
import { ArrowLeft, Save, Eye, Copy, RefreshCw, Maximize2, X, ChevronDown, User, Briefcase, FolderKanban } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// Field Item Component - single clickable field
interface FieldItemProps {
  field: FieldInfo
  onInsert: (field: string, isSection?: boolean) => void
}

function FieldItem({ field, onInsert }: FieldItemProps) {
  return (
    <button
      onClick={() => onInsert(field.field, field.is_section)}
      className="flex items-center gap-2 text-sm p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded w-full text-left transition-colors"
    >
      <Copy className="h-3 w-3 text-gray-400 flex-shrink-0" />
      <span className="font-mono text-blue-600 dark:text-blue-400 text-xs">
        {field.is_section ? `{{#${field.field}}}` : `{{${field.field}}}`}
      </span>
      <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{field.description}</span>
    </button>
  )
}

// Field Group Component - collapsible group of fields
interface FieldGroupProps {
  title: string
  icon: React.ReactNode
  fields?: FieldInfo[]
  subGroups?: { title: string; fields?: FieldInfo[] }[]
  onInsertField: (field: string, isSection?: boolean) => void
  defaultOpen?: boolean
}

function FieldGroup({ title, icon, fields, subGroups, onInsertField, defaultOpen = false }: FieldGroupProps) {
  const hasFields = fields && fields.length > 0
  const hasSubGroups = subGroups && subGroups.some(g => g.fields && g.fields.length > 0)

  if (!hasFields && !hasSubGroups) return null

  return (
    <Collapsible defaultOpen={defaultOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            {icon}
          </div>
          <span className="font-medium">{title}</span>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <div className="p-4 space-y-4">
          {/* Direct fields */}
          {hasFields && (
            <div className="grid gap-1">
              {fields.map((field) => (
                <FieldItem key={field.field} field={field} onInsert={onInsertField} />
              ))}
            </div>
          )}

          {/* Sub groups */}
          {hasSubGroups && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {subGroups.map((group) => {
                if (!group.fields || group.fields.length === 0) return null
                return (
                  <div key={group.title} className="space-y-2">
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 border-b pb-1">
                      {group.title}
                    </h5>
                    <div className="space-y-1">
                      {group.fields.map((field) => (
                        <FieldItem key={field.field} field={field} onInsert={onInsertField} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation('templates')
  const { t: tc } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [fieldsUsed, setFieldsUsed] = useState<string[]>([])
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fetch template if editing existing
  const { data: templateData, isLoading: isTemplateLoading } = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => templatesApi.getById(Number(templateId)),
    enabled: !!templateId && templateId !== 'new',
  })

  // Fetch available fields
  const { data: fieldsData } = useQuery({
    queryKey: ['template-fields'],
    queryFn: () => templatesApi.getAvailableFields(),
  })

  // Initialize form when template loads
  useEffect(() => {
    if (templateData?.data) {
      const template = templateData.data
      setName(template.name)
      setDescription(template.description || '')
      setContent(template.template_content || '')
    }
  }, [templateData])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; template_content: string }) =>
      templatesApi.update(Number(templateId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template', templateId] })
      toast({ title: t('saved') })
      navigate('/templates')
    },
    onError: () => {
      toast({ title: tc('error'), description: t('editor.saveFailed'), variant: 'destructive' })
    },
  })

  // Create mutation (for new templates)
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; template_content: string }) =>
      templatesApi.create(user!.id, { ...data, output_format: 'md' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: t('saved') })
      navigate('/templates')
    },
    onError: () => {
      toast({ title: tc('error'), description: t('editor.createFailed'), variant: 'destructive' })
    },
  })

  // Preview template
  const handlePreview = useCallback(async () => {
    if (!content.trim()) {
      toast({ title: t('editor.enterTemplateContent') })
      return
    }

    setIsPreviewLoading(true)
    try {
      console.log('[Editor] Previewing template with user:', user?.id)
      const response = await templatesApi.preview(
        { template_content: content },
        user?.id
      )
      console.log('[Editor] Preview response:', response.data)
      setPreviewHtml(response.data.preview_html || '')
      setPreviewText(response.data.preview_text || '')
      setFieldsUsed(response.data.fields_used || [])
    } catch (error: unknown) {
      // Extract error message from API response
      let errorMessage: string
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { detail?: string }, status?: number } }
        errorMessage = axiosError.response?.data?.detail || String(error)
        console.error('[Editor] Template preview API error:', axiosError.response?.status, errorMessage)
      } else {
        errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[Editor] Template preview failed:', errorMessage)
      }
      toast({ title: tc('error'), description: t('editor.previewFailed'), variant: 'destructive' })
      // Set fallback preview showing raw template
      setPreviewHtml(`<pre style="color: red; white-space: pre-wrap;">${t('editor.previewFailed')}\n${errorMessage}\n\n${content}</pre>`)
      setPreviewText(content)
    } finally {
      setIsPreviewLoading(false)
    }
  }, [content, user?.id, toast, t, tc])

  // Auto-preview on content change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content.trim()) {
        handlePreview()
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [content, handlePreview])

  // Save template
  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: t('editor.enterTemplateName') })
      return
    }
    if (!content.trim()) {
      toast({ title: t('editor.enterTemplateContent') })
      return
    }

    const data = { name, description, template_content: content }
    if (templateId && templateId !== 'new') {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  // Insert field at cursor position
  const insertField = (field: string, isSection = false) => {
    const textarea = document.getElementById('template-content') as HTMLTextAreaElement
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = content

    let insertText: string
    if (isSection) {
      insertText = `{{#${field}}}\n\n{{/${field}}}`
    } else {
      insertText = `{{${field}}}`
    }

    const newContent = text.substring(0, start) + insertText + text.substring(end)
    setContent(newContent)

    // Reset cursor position
    setTimeout(() => {
      textarea.focus()
      const newPos = start + insertText.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }

  const isSystemTemplate = templateData?.data?.is_system
  const isNew = !templateId || templateId === 'new'

  if (isTemplateLoading) {
    return <div className="text-center py-8">{tc('loading')}</div>
  }

  if (isSystemTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/templates')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('editor.goBack')}
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-600 mb-4">
              {t('editor.systemTemplateNotEditable')}
              <br />
              {t('editor.cloneToEdit')}
            </p>
            <Button onClick={() => navigate('/templates')}>
              {t('editor.goToList')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Template content placeholder
  const templatePlaceholder = `# {{name}} 이력서

## 경력
{{#companies}}
### {{name}} | {{position}}
{{start_date}} ~ {{end_date}}
{{description}}
{{/companies}}

## 프로젝트
{{#projects}}
### {{name}}
- 역할: {{role}}
- 기술: {{technologies}}
{{/projects}}`

  // Render editor panel inline (not as a separate component to preserve focus)
  const renderEditorPanel = (textareaId: string) => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 dark:bg-gray-900">
        <h3 className="font-semibold">{t('editor.templateContent')}</h3>
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={isPreviewLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isPreviewLoading ? 'animate-spin' : ''}`} />
          {t('editor.previewBtn')}
        </Button>
      </div>
      <div className="flex-1 p-4">
        <Textarea
          id={textareaId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="font-mono text-sm h-full min-h-[500px] resize-none"
          placeholder={templatePlaceholder}
        />
      </div>
    </div>
  )

  // Render preview panel inline
  const renderPreviewPanel = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b bg-gray-50 dark:bg-gray-900">
        <Eye className="h-5 w-5" />
        <h3 className="font-semibold">{t('preview')}</h3>
      </div>
      <div className="flex-1 p-4 overflow-hidden">
        <Tabs defaultValue="rendered" className="h-full flex flex-col">
          <TabsList className="mb-4 flex-shrink-0">
            <TabsTrigger value="rendered">{t('editor.rendered')}</TabsTrigger>
            <TabsTrigger value="text">{t('editor.text')}</TabsTrigger>
            <TabsTrigger value="fields">{t('editor.fieldsUsed')}</TabsTrigger>
          </TabsList>

          <TabsContent value="rendered" className="flex-1 overflow-auto">
            {previewHtml ? (
              <div
                className="prose prose-sm max-w-none p-4 border rounded-lg bg-white dark:bg-gray-950 overflow-auto h-full"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                {t('editor.previewPlaceholder')}
              </div>
            )}
          </TabsContent>

          <TabsContent value="text" className="flex-1 overflow-auto">
            <pre className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 overflow-auto h-full text-sm whitespace-pre-wrap">
              {previewText || t('editor.noPreview')}
            </pre>
          </TabsContent>

          <TabsContent value="fields" className="flex-1 overflow-auto">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">{t('editor.fieldsUsedCount', { count: fieldsUsed.length })}</h4>
              <div className="flex flex-wrap gap-2">
                {fieldsUsed.map((field) => (
                  <Badge key={field} variant="secondary">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )

  // Available Fields Component (reusable) - Grouped by sidebar structure
  const AvailableFieldsPanel = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('availableFields')}
          <span className="text-sm font-normal text-gray-500">
            {t('editor.clickToInsert')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Group 1: 기본 정보 (User Info) */}
        <FieldGroup
          title={t('fieldGroups.basicInfo')}
          icon={<User className="h-4 w-4 text-primary" />}
          fields={fieldsData?.data?.user_fields}
          onInsertField={insertField}
          defaultOpen={true}
        />

        {/* Group 2: 이력 관리 (Career Management) - matches sidebar "이력 관리" */}
        <FieldGroup
          title={t('fieldGroups.careerManagement')}
          icon={<Briefcase className="h-4 w-4 text-primary" />}
          subGroups={[
            { title: t('companyFields'), fields: fieldsData?.data?.company_fields },
            { title: t('certificationFields'), fields: fieldsData?.data?.certification_fields },
            { title: t('awardFields'), fields: fieldsData?.data?.award_fields },
            { title: t('educationFields'), fields: fieldsData?.data?.education_fields },
            { title: t('publicationFields'), fields: fieldsData?.data?.publication_fields },
            { title: t('volunteerActivityFields'), fields: fieldsData?.data?.volunteer_activity_fields },
          ]}
          onInsertField={insertField}
        />

        {/* Group 3: 프로젝트 (Projects) - matches sidebar "프로젝트 관리" */}
        <FieldGroup
          title={t('fieldGroups.projectManagement')}
          icon={<FolderKanban className="h-4 w-4 text-primary" />}
          subGroups={[
            { title: t('projectFields'), fields: fieldsData?.data?.project_fields },
            { title: t('achievementFields'), fields: fieldsData?.data?.achievement_fields },
          ]}
          onInsertField={insertField}
        />

        {/* Syntax Guide */}
        {fieldsData?.data?.syntax_guide && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="font-medium mb-2 text-sm">{t('editor.syntaxGuide')}</h4>
            <div className="grid gap-3 md:grid-cols-3 text-xs">
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                  {fieldsData.data.syntax_guide.simple_field}
                </code>
                <span className="text-gray-500">{t('editor.singleField')}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                  {fieldsData.data.syntax_guide.section_start}
                </code>
                <span className="text-gray-500">{t('editor.sectionStart')}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                  {fieldsData.data.syntax_guide.section_end}
                </code>
                <span className="text-gray-500">{t('editor.sectionEnd')}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/templates')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('editor.goBack')}
            </Button>
            <h1 className="text-2xl font-bold">
              {isNew ? t('editor.createNew') : t('editor.editExisting')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsFullscreen(true)}>
              <Maximize2 className="h-4 w-4 mr-2" />
              {t('fullscreen')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || createMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {t('editor.save')}
            </Button>
          </div>
        </div>

        {/* Template Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t('editor.templateInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('editor.templateNameLabel')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('editor.templateNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('editor.descriptionLabel')}</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('editor.descriptionPlaceholder')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resizable Editor and Preview */}
        <div className="border rounded-lg overflow-hidden h-[600px]">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={50} minSize={30}>
              {renderEditorPanel('template-content')}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={30}>
              {renderPreviewPanel()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Available Fields */}
        <AvailableFieldsPanel />
      </div>

      {/* Fullscreen Dialog */}
      <FullScreenDialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <FullScreenDialogContent>
          <FullScreenDialogHeader>
            <div className="flex items-center gap-4">
              <FullScreenDialogTitle>
                {name || t('newTemplate')} - {t('editor.fullscreenEdit')}
              </FullScreenDialogTitle>
              <Badge variant="secondary">{isNew ? t('editor.newTemplateStatus') : t('editor.editingStatus')}</Badge>
            </div>
            <div className="flex items-center gap-2 mr-12">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending || createMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {t('editor.save')}
              </Button>
            </div>
          </FullScreenDialogHeader>
          <FullScreenDialogBody className="p-4">
            <div className="border rounded-lg overflow-hidden h-full">
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel defaultSize={50} minSize={30}>
                  {renderEditorPanel('template-content-fullscreen')}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={30}>
                  {renderPreviewPanel()}
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </FullScreenDialogBody>
          <FullScreenDialogFooter>
            <div className="flex-1">
              <p className="text-sm text-gray-500">
                {t('editor.mustacheSyntax')}
              </p>
            </div>
            <Button variant="outline" onClick={() => setIsFullscreen(false)}>
              <X className="h-4 w-4 mr-2" />
              {t('editor.close')}
            </Button>
          </FullScreenDialogFooter>
        </FullScreenDialogContent>
      </FullScreenDialog>
    </>
  )
}
