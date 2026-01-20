import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { templatesApi } from '@/api/templates'
import { FileText, Upload, Trash2, Edit, Copy, Plus } from 'lucide-react'

export default function TemplatesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: () => templatesApi.getAll(user?.id),
  })

  const initMutation = useMutation({
    mutationFn: () => templatesApi.initSystemTemplates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: '시스템 템플릿이 초기화되었습니다.' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => templatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: '템플릿이 삭제되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '삭제에 실패했습니다.', variant: 'destructive' }),
  })

  const cloneMutation = useMutation({
    mutationFn: ({ templateId, newName }: { templateId: number; newName?: string }) =>
      templatesApi.clone(templateId, user!.id, newName),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: '템플릿이 복제되었습니다.' })
      // Navigate to edit the cloned template
      navigate(`/templates/${response.data.id}/edit`)
    },
    onError: () => toast({ title: '오류', description: '복제에 실패했습니다.', variant: 'destructive' }),
  })

  useEffect(() => {
    // Initialize system templates if none exist
    if (templatesData?.data?.templates?.length === 0) {
      initMutation.mutate()
    }
  }, [templatesData])

  const templates = templatesData?.data?.templates || []
  const systemTemplates = templates.filter((t) => t.is_system)
  const userTemplates = templates.filter((t) => !t.is_system)

  const platformLabels: Record<string, string> = {
    saramin_1: '사람인 기본형',
    saramin_2: '사람인 상세형',
    saramin_3: '사람인 포트폴리오형',
    wanted: '원티드',
    remember: '리멤버',
    notion: '노션',
    custom: '커스텀',
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    const name = prompt('템플릿 이름을 입력하세요:')
    if (!name) return

    try {
      await templatesApi.upload(user.id, file, name)
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: '템플릿이 업로드되었습니다.' })
    } catch {
      toast({ title: '오류', description: '업로드에 실패했습니다.', variant: 'destructive' })
    }

    e.target.value = ''
  }

  const handleClone = (templateId: number, templateName: string) => {
    const newName = prompt('새 템플릿 이름을 입력하세요:', `${templateName} (복사본)`)
    if (newName !== null) {
      cloneMutation.mutate({ templateId, newName: newName || undefined })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">템플릿 관리</h1>
          <p className="text-gray-600">이력서/포트폴리오 템플릿을 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/templates/new/edit')}>
            <Plus className="h-4 w-4 mr-2" />
            새 템플릿
          </Button>
          <label>
            <input
              type="file"
              accept=".docx,.doc,.pdf"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                파일 업로드
              </span>
            </Button>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">로딩 중...</div>
      ) : (
        <div className="space-y-8">
          {/* System Templates */}
          <div>
            <h2 className="text-xl font-semibold mb-4">시스템 템플릿</h2>
            <p className="text-sm text-gray-500 mb-4">
              시스템 템플릿은 직접 수정할 수 없습니다. "복제" 버튼을 눌러 나만의 템플릿을 만들어보세요.
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {systemTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription>
                          {platformLabels[template.platform || ''] || template.platform}
                        </CardDescription>
                      </div>
                      <Badge>{template.output_format.toUpperCase()}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {template.description && (
                      <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs mb-4">
                      {template.max_projects && (
                        <Badge variant="outline">최대 {template.max_projects}개 프로젝트</Badge>
                      )}
                      {template.sections?.map((section) => (
                        <Badge key={section} variant="secondary">
                          {section}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleClone(template.id, template.name)}
                        disabled={cloneMutation.isPending}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        복제
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* User Templates */}
          {userTemplates.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">내 템플릿</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {userTemplates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription>
                            {platformLabels[template.platform || ''] || template.platform || '커스텀'}
                          </CardDescription>
                        </div>
                        <Badge>{template.output_format.toUpperCase()}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {template.description && (
                        <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => navigate(`/templates/${template.id}/edit`)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          편집
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClone(template.id, template.name)}
                          disabled={cloneMutation.isPending}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('정말 삭제하시겠습니까?')) {
                              deleteMutation.mutate(template.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {templates.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">템플릿이 없습니다</h3>
                <p className="text-gray-500 mb-4">시스템 템플릿을 초기화하거나 직접 업로드하세요.</p>
                <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
                  시스템 템플릿 초기화
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
