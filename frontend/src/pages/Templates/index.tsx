import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { templatesApi, Template } from '@/api/templates'
import { ScrollToTop } from '@/components/ScrollToTop'
import { FileText, Upload, Trash2, Edit, Copy, Plus } from 'lucide-react'

// Type for the query data (Axios response structure)
type TemplatesQueryData = AxiosResponse<{ templates: Template[]; total: number }>

export default function TemplatesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('templates')
  const { t: tc } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: () => templatesApi.getAll(user?.id),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => templatesApi.delete(id),
    onMutate: async (deletedId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['templates', user?.id] })

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<TemplatesQueryData>(['templates', user?.id])

      // Optimistically update using updater function (React Query v5 recommended pattern)
      queryClient.setQueryData<TemplatesQueryData>(['templates', user?.id], (oldData) => {
        if (!oldData?.data?.templates) return oldData
        const newTemplates = oldData.data.templates.filter((t) => t.id !== deletedId)
        return {
          ...oldData,
          data: {
            ...oldData.data,
            templates: newTemplates,
            total: newTemplates.length,
          },
        }
      })

      return { previousData }
    },
    onSuccess: () => {
      toast({ title: t('deleted') })
    },
    onError: (_err, _deletedId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['templates', user?.id], context.previousData)
      }
      toast({ title: tc('error'), description: t('deleteError'), variant: 'destructive' })
    },
    onSettled: () => {
      // Small delay to ensure server has finished processing before refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['templates', user?.id] })
      }, 200)
    },
  })

  const cloneMutation = useMutation({
    mutationFn: ({ templateId, newName }: { templateId: number; newName?: string }) =>
      templatesApi.clone(templateId, user!.id, newName),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.id] })
      toast({ title: t('cloned') })
      // Navigate to edit the cloned template
      navigate(`/templates/${response.data.id}/edit`)
    },
    onError: () => toast({ title: tc('error'), description: t('cloneError'), variant: 'destructive' }),
  })

  const templates = templatesData?.data?.templates || []
  const systemTemplates = templates.filter((tmpl) => tmpl.is_system)
  const userTemplates = templates.filter((tmpl) => !tmpl.is_system)

  const getPlatformLabel = (platform: string) => {
    const key = `platforms.${platform}` as const
    const translated = t(key)
    // If translation key doesn't exist, return the original platform name
    return translated === key ? platform : translated
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    const name = prompt(t('templateNamePrompt'))
    if (!name) return

    try {
      await templatesApi.upload(user.id, file, name)
      queryClient.invalidateQueries({ queryKey: ['templates', user?.id] })
      toast({ title: t('uploaded') })
    } catch {
      toast({ title: tc('error'), description: t('uploadError'), variant: 'destructive' })
    }

    e.target.value = ''
  }

  const handleClone = (templateId: number, templateName: string) => {
    const newName = prompt(t('cloneNamePrompt'), `${templateName} (copy)`)
    if (newName !== null) {
      cloneMutation.mutate({ templateId, newName: newName || undefined })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/templates/new/edit')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('newTemplate')}
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
                {t('fileUpload')}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{tc('loading')}</div>
      ) : (
        <div className="space-y-8">
          {/* System Templates */}
          <div>
            <h2 className="text-xl font-semibold mb-4">{t('systemTemplate')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('systemTemplateDesc')}
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {systemTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription>
                          {getPlatformLabel(template.platform || '')}
                        </CardDescription>
                      </div>
                      <Badge>{template.output_format.toUpperCase()}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {template.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{template.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs mb-4">
                      {template.max_projects && (
                        <Badge variant="outline">{t('maxProjects', { count: template.max_projects })}</Badge>
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
                        {t('clone')}
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
              <h2 className="text-xl font-semibold mb-4">{t('userTemplate')}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {userTemplates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription>
                            {getPlatformLabel(template.platform || '') || t('platforms.custom')}
                          </CardDescription>
                        </div>
                        <Badge>{template.output_format.toUpperCase()}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {template.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{template.description}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => navigate(`/templates/${template.id}/edit`)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          {t('edit')}
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
                            if (confirm(tc('confirmDelete'))) {
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
                <FileText className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('noTemplates')}</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">{t('noTemplatesDesc')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ScrollToTop />
    </div>
  )
}
