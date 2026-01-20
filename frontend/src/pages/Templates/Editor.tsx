import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import { templatesApi, Template, FieldInfo } from '@/api/templates'
import { ArrowLeft, Save, Eye, Copy, RefreshCw } from 'lucide-react'

export default function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
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
      toast({ title: '템플릿이 저장되었습니다.' })
    },
    onError: () => {
      toast({ title: '오류', description: '저장에 실패했습니다.', variant: 'destructive' })
    },
  })

  // Create mutation (for new templates)
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; template_content: string }) =>
      templatesApi.create(user!.id, { ...data, output_format: 'md' }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: '템플릿이 생성되었습니다.' })
      navigate(`/templates/${response.data.id}/edit`)
    },
    onError: () => {
      toast({ title: '오류', description: '생성에 실패했습니다.', variant: 'destructive' })
    },
  })

  // Preview template
  const handlePreview = useCallback(async () => {
    if (!content.trim()) {
      toast({ title: '템플릿 내용을 입력하세요.' })
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
      toast({ title: '오류', description: '미리보기 생성 실패', variant: 'destructive' })
    } finally {
      setIsPreviewLoading(false)
    }
  }, [content, user?.id, toast])

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
      toast({ title: '템플릿 이름을 입력하세요.' })
      return
    }
    if (!content.trim()) {
      toast({ title: '템플릿 내용을 입력하세요.' })
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
    return <div className="text-center py-8">로딩 중...</div>
  }

  if (isSystemTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/templates')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            돌아가기
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-600 mb-4">
              시스템 템플릿은 직접 수정할 수 없습니다.
              <br />
              복제하여 수정해주세요.
            </p>
            <Button onClick={() => navigate('/templates')}>
              템플릿 목록으로
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/templates')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            돌아가기
          </Button>
          <h1 className="text-2xl font-bold">
            {isNew ? '새 템플릿 만들기' : '템플릿 편집'}
          </h1>
        </div>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || createMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          저장
        </Button>
      </div>

      {/* Template Info */}
      <Card>
        <CardHeader>
          <CardTitle>템플릿 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">템플릿 이름</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 사람인 이력서"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">설명 (선택)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="템플릿에 대한 간단한 설명"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editor and Preview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>템플릿 내용</CardTitle>
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={isPreviewLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isPreviewLoading ? 'animate-spin' : ''}`} />
                미리보기
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              id="template-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm min-h-[500px]"
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
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              미리보기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="rendered">
              <TabsList className="mb-4">
                <TabsTrigger value="rendered">렌더링</TabsTrigger>
                <TabsTrigger value="text">텍스트</TabsTrigger>
                <TabsTrigger value="fields">사용된 필드</TabsTrigger>
              </TabsList>

              <TabsContent value="rendered" className="min-h-[450px]">
                {previewHtml ? (
                  <div
                    className="prose prose-sm max-w-none p-4 border rounded-lg bg-white overflow-auto max-h-[500px]"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    템플릿 내용을 입력하면 미리보기가 표시됩니다.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="text" className="min-h-[450px]">
                <pre className="p-4 border rounded-lg bg-gray-50 overflow-auto max-h-[500px] text-sm whitespace-pre-wrap">
                  {previewText || '미리보기 없음'}
                </pre>
              </TabsContent>

              <TabsContent value="fields" className="min-h-[450px]">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">사용된 필드 ({fieldsUsed.length}개)</h4>
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
          </CardContent>
        </Card>
      </div>

      {/* Available Fields */}
      <Card>
        <CardHeader>
          <CardTitle>사용 가능한 필드</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* User Fields */}
            <div>
              <h4 className="font-medium mb-3">사용자 정보</h4>
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
              <h4 className="font-medium mb-3">회사 정보</h4>
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
              <h4 className="font-medium mb-3">프로젝트 정보</h4>
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
              <h4 className="font-medium mb-3">성과 정보</h4>
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
              <h4 className="font-medium mb-2">문법 가이드</h4>
              <div className="grid gap-4 md:grid-cols-3 text-sm">
                <div>
                  <span className="font-mono text-blue-600">{fieldsData.data.syntax_guide.simple_field}</span>
                  <span className="text-gray-500 ml-2">- 단일 필드</span>
                </div>
                <div>
                  <span className="font-mono text-blue-600">{fieldsData.data.syntax_guide.section_start}</span>
                  <span className="text-gray-500 ml-2">- 섹션 시작</span>
                </div>
                <div>
                  <span className="font-mono text-blue-600">{fieldsData.data.syntax_guide.section_end}</span>
                  <span className="text-gray-500 ml-2">- 섹션 종료</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
