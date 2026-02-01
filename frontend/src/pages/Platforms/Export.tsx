import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ArrowLeft,
  Download,
  FileText,
  FileCode,
  File,
  Eye,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { platformsApi, RenderDataRequest } from '@/api/platforms'
import { useUserStore } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'

type ExportFormat = 'html' | 'md' | 'docx'

const formatOptions: { value: ExportFormat; label: string; icon: typeof FileText; description: string }[] = [
  {
    value: 'html',
    label: 'HTML',
    icon: FileCode,
    description: 'formatHtmlDesc',
  },
  {
    value: 'md',
    label: 'Markdown',
    icon: FileText,
    description: 'formatMdDesc',
  },
  {
    value: 'docx',
    label: 'Word (DOCX)',
    icon: File,
    description: 'formatDocxDesc',
  },
]

export default function PlatformExportPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation(['platforms', 'common'])
  const { toast } = useToast()
  const { user } = useUserStore()

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('html')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  // Fetch template details
  const {
    data: templateData,
    isLoading: isLoadingTemplate,
  } = useQuery({
    queryKey: ['platformTemplate', templateId],
    queryFn: () => platformsApi.getById(Number(templateId)),
    enabled: !!templateId,
  })

  const template = templateData?.data

  // Load preview when template is available
  useEffect(() => {
    const loadPreview = async () => {
      if (!template || !user?.id) return

      setIsPreviewLoading(true)
      try {
        const response = await platformsApi.renderFromDb(Number(templateId), user.id)
        setPreviewHtml(response.data.html)
      } catch {
        // Preview load failed - silently ignore as UI shows empty state
      } finally {
        setIsPreviewLoading(false)
      }
    }

    loadPreview()
  }, [template, templateId, user?.id])

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async ({ format }: { format: ExportFormat }) => {
      if (!user?.id) throw new Error('User not found')

      // Create data object from user info
      const data: RenderDataRequest = {
        name: user.name || 'User',
        email: user.email ?? undefined,
        github_url: user.github_username ? `https://github.com/${user.github_username}` : undefined,
      }

      switch (format) {
        case 'html':
          return platformsApi.exportToHtml(Number(templateId), data)
        case 'md':
          return platformsApi.exportToMarkdown(Number(templateId), data)
        case 'docx':
          return platformsApi.exportToDocx(Number(templateId), data)
        default:
          throw new Error(`Unknown format: ${format}`)
      }
    },
    onSuccess: (response) => {
      const { filename, download_url } = response.data

      // Trigger download
      const link = document.createElement('a')
      link.href = download_url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: t('exportSuccess'),
        description: t('fileDownloaded', { filename }),
      })
    },
    onError: (error) => {
      toast({
        title: t('common:error'),
        description: String(error),
        variant: 'destructive',
      })
    },
  })

  if (isLoadingTemplate) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('templateNotFound')}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/platforms')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('backToTemplates')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/platforms')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('exportTitle', { name: template.name })}</h1>
          <p className="text-muted-foreground">{t('exportDescription')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {t('exportOptions')}
            </CardTitle>
            <CardDescription>{t('selectFormat')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Format Selection */}
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as ExportFormat)}
              className="space-y-3"
            >
              {formatOptions.map((option) => {
                const Icon = option.icon
                return (
                  <div
                    key={option.value}
                    className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedFormat === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedFormat(option.value)}
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <Label htmlFor={option.value} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t(option.description)}
                      </p>
                    </div>
                    {selectedFormat === option.value && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                )
              })}
            </RadioGroup>

            {/* Export Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={() => exportMutation.mutate({ format: selectedFormat })}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('exporting')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {t('downloadFormat', { format: selectedFormat.toUpperCase() })}
                </>
              )}
            </Button>

            {/* Template Info */}
            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('template')}:</span>
                <span className="font-medium">{template.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('platform')}:</span>
                <Badge variant="outline">{template.platform_key}</Badge>
              </div>
              {template.features && template.features.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2">
                  {template.features.map((feature, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t('preview')}
            </CardTitle>
            <CardDescription>{t('previewDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isPreviewLoading ? (
              <div className="flex items-center justify-center h-96 bg-muted rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewHtml ? (
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-96"
                  title="Resume Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 bg-muted rounded-lg">
                <p className="text-muted-foreground">{t('noPreviewAvailable')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
