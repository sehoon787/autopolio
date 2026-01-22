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
import { ArrowLeft, Save, Eye, Copy, RefreshCw, Maximize2, X } from 'lucide-react'

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
    },
    onError: () => {
      toast({ title: tc('error'), description: t('editor.saveFailed'), variant: 'destructive' })
    },
  })

  // Create mutation (for new templates)
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; template_content: string }) =>
      templatesApi.create(user!.id, { ...data, output_format: 'md' }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: t('saved') })
      navigate(`/templates/${response.data.id}/edit`)
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
      const response = await templatesApi.preview(
        { template_content: content },
        user?.id
      )
      setPreviewHtml(response.data.preview_html)
      setPreviewText(response.data.preview_text)
      setFieldsUsed(response.data.fields_used)
    } catch {
      toast({ title: tc('error'), description: t('editor.previewFailed'), variant: 'destructive' })
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

  // Editor Panel Component
  const EditorPanel = ({ textareaId = 'template-content' }: { textareaId?: string }) => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
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
          placeholder={`# {{name}} 이력서

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
{{/projects}}`}
        />
      </div>
    </div>
  )

  // Preview Panel Component
  const PreviewPanel = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b bg-gray-50">
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
                className="prose prose-sm max-w-none p-4 border rounded-lg bg-white overflow-auto h-full"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                {t('editor.previewPlaceholder')}
              </div>
            )}
          </TabsContent>

          <TabsContent value="text" className="flex-1 overflow-auto">
            <pre className="p-4 border rounded-lg bg-gray-50 overflow-auto h-full text-sm whitespace-pre-wrap">
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

  // Resizable Editor and Preview Panel
  const ResizableEditorAndPreview = ({ inFullscreen = false }: { inFullscreen?: boolean }) => (
    <div className={`border rounded-lg overflow-hidden ${inFullscreen ? 'h-full' : 'h-[600px]'}`}>
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={50} minSize={30}>
          <EditorPanel textareaId={inFullscreen ? 'template-content-fullscreen' : 'template-content'} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={30}>
          <PreviewPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )

  // Available Fields Component (reusable)
  const AvailableFieldsPanel = () => (
    <Card>
      <CardHeader>
        <CardTitle>{t('availableFields')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* User Fields */}
          <div>
            <h4 className="font-medium mb-3">{t('userFields')}</h4>
            <div className="space-y-2">
              {fieldsData?.data?.user_fields?.map((field: FieldInfo) => (
                <button
                  key={field.field}
                  onClick={() => insertField(field.field, field.is_section)}
                  className="flex items-center gap-2 text-sm p-2 hover:bg-gray-100 rounded w-full text-left"
                >
                  <Copy className="h-3 w-3 text-gray-400" />
                  <span className="font-mono text-blue-600">{`{{${field.field}}}`}</span>
                  <span className="text-gray-500 text-xs">{field.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Company Fields */}
          <div>
            <h4 className="font-medium mb-3">{t('companyFields')}</h4>
            <div className="space-y-2">
              {fieldsData?.data?.company_fields?.map((field: FieldInfo) => (
                <button
                  key={field.field}
                  onClick={() => insertField(field.field, field.is_section)}
                  className="flex items-center gap-2 text-sm p-2 hover:bg-gray-100 rounded w-full text-left"
                >
                  <Copy className="h-3 w-3 text-gray-400" />
                  <span className="font-mono text-blue-600">
                    {field.is_section ? `{{#${field.field}}}...{{/${field.field}}}` : `{{${field.field}}}`}
                  </span>
                  <span className="text-gray-500 text-xs">{field.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Project Fields */}
          <div>
            <h4 className="font-medium mb-3">{t('projectFields')}</h4>
            <div className="space-y-2">
              {fieldsData?.data?.project_fields?.map((field: FieldInfo) => (
                <button
                  key={field.field}
                  onClick={() => insertField(field.field, field.is_section)}
                  className="flex items-center gap-2 text-sm p-2 hover:bg-gray-100 rounded w-full text-left"
                >
                  <Copy className="h-3 w-3 text-gray-400" />
                  <span className="font-mono text-blue-600">
                    {field.is_section ? `{{#${field.field}}}...{{/${field.field}}}` : `{{${field.field}}}`}
                  </span>
                  <span className="text-gray-500 text-xs">{field.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Achievement Fields */}
          <div>
            <h4 className="font-medium mb-3">{t('achievementFields')}</h4>
            <div className="space-y-2">
              {fieldsData?.data?.achievement_fields?.map((field: FieldInfo) => (
                <button
                  key={field.field}
                  onClick={() => insertField(field.field, field.is_section)}
                  className="flex items-center gap-2 text-sm p-2 hover:bg-gray-100 rounded w-full text-left"
                >
                  <Copy className="h-3 w-3 text-gray-400" />
                  <span className="font-mono text-blue-600">
                    {field.is_section ? `{{#${field.field}}}...{{/${field.field}}}` : `{{${field.field}}}`}
                  </span>
                  <span className="text-gray-500 text-xs">{field.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Syntax Guide */}
        {fieldsData?.data?.syntax_guide && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">{t('editor.syntaxGuide')}</h4>
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div>
                <span className="font-mono text-blue-600">{fieldsData.data.syntax_guide.simple_field}</span>
                <span className="text-gray-500 ml-2">- {t('editor.singleField')}</span>
              </div>
              <div>
                <span className="font-mono text-blue-600">{fieldsData.data.syntax_guide.section_start}</span>
                <span className="text-gray-500 ml-2">- {t('editor.sectionStart')}</span>
              </div>
              <div>
                <span className="font-mono text-blue-600">{fieldsData.data.syntax_guide.section_end}</span>
                <span className="text-gray-500 ml-2">- {t('editor.sectionEnd')}</span>
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
        <ResizableEditorAndPreview />

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
            <ResizableEditorAndPreview inFullscreen />
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
