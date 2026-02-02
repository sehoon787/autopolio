import { useState, useEffect, useCallback, useRef } from 'react'

// Build version for cache busting
const BUILD_VERSION = '1.11.1-20260202'
if (typeof window !== 'undefined') {
  (window as unknown as { __PREVIEW_VERSION__: string }).__PREVIEW_VERSION__ = BUILD_VERSION
}
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Download,
  Maximize2,
  Minimize2,
  Loader2,
  Printer,
} from 'lucide-react'
import { platformsApi } from '@/api/platforms'
import { useUserStore } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

type DataSourceStatus = 'real' | 'sample' | 'loading'

export default function PlatformPreviewPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation(['platforms', 'common'])
  const { user } = useUserStore()

  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Data source tracking for HTML preview
  const [dataSource, setDataSource] = useState<DataSourceStatus>('loading')

  // User toggle: show real data (default: false = sample data)
  const [useRealData, setUseRealData] = useState(false)

  // Track what source has been loaded to prevent redundant API calls
  const loadedSourceRef = useRef<'real' | 'sample' | null>(null)

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

  // Load HTML preview - tries user data first, falls back to sample data
  const loadHtmlPreview = useCallback(async (forceSample = false) => {
    if (!template) return

    setIsPreviewLoading(true)
    setDataSource('loading')
    try {
      // If not forcing sample and user exists, try real data first
      if (!forceSample && user?.id) {
        try {
          const response = await platformsApi.renderFromDb(Number(templateId), user.id)
          if (response.data.html) {
            setPreviewHtml(response.data.html)
            setDataSource('real')
            return
          }
        } catch {
          // Fall through to sample data
        }
      }

      // Fall back to sample data
      const sampleResponse = await platformsApi.previewWithSampleData(Number(templateId))
      setPreviewHtml(sampleResponse.data.html)
      setDataSource('sample')
    } catch {
      // Preview load failed - silently ignore as UI shows empty state
    } finally {
      setIsPreviewLoading(false)
    }
  }, [template, templateId, user?.id])

  // Load preview when template loads or toggle changes
  // Uses ref to track what source has been loaded to prevent redundant API calls
  useEffect(() => {
    if (!template) return

    const targetSource: 'real' | 'sample' = useRealData ? 'real' : 'sample'
    const forceSample = !useRealData

    // Only reload if source changed or not loaded yet
    if (loadedSourceRef.current !== targetSource) {
      setPreviewHtml('')  // Clear to show loading state
      loadHtmlPreview(forceSample)
      loadedSourceRef.current = targetSource
    }
  }, [template, useRealData, loadHtmlPreview])

  const handlePrint = () => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      iframe.contentWindow.print()
    }
  }

  if (isLoadingTemplate) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[80vh]" />
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

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            {t('common:print')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
            <Minimize2 className="h-4 w-4 mr-2" />
            {t('exitFullscreen')}
          </Button>
        </div>
        {isPreviewLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <iframe
            srcDoc={previewHtml}
            className="w-full h-full"
            title="Resume Preview"
          />
        )}
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/platforms')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {template.name}
              {template.is_system && (
                <Badge variant="secondary">{t('systemTemplate')}</Badge>
              )}
            </h1>
            <p className="text-muted-foreground">{t('previewTitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            {t('common:print')}
          </Button>
          <Button variant="outline" onClick={() => setIsFullscreen(true)}>
            <Maximize2 className="h-4 w-4 mr-2" />
            {t('fullscreen')}
          </Button>
          <Button onClick={() => navigate(`/platforms/${templateId}/export`)}>
            <Download className="h-4 w-4 mr-2" />
            {t('export')}
          </Button>
        </div>
      </div>

      {/* Preview with Format Tabs */}
      <Card>
        <CardHeader className="pb-2">
          {/* Current data source badge - upper left */}
          {dataSource === 'loading' ? null : dataSource === 'real' ? (
            <Badge variant="default" className="w-fit bg-green-600">
              {t('usingRealData')}
            </Badge>
          ) : dataSource === 'sample' ? (
            <Badge variant="secondary" className="w-fit">
              {t('sampleDataBadge')}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          {/* Data source toggle */}
          <div className="flex items-center justify-end mb-4">
            <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
              <Switch
                id="real-data-toggle"
                checked={useRealData}
                onCheckedChange={setUseRealData}
              />
              <Label htmlFor="real-data-toggle" className="text-sm font-medium cursor-pointer whitespace-nowrap">
                {t('showRealData')}
              </Label>
            </div>
          </div>

          {/* HTML Preview */}
          {isPreviewLoading ? (
            <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">{t('loadingPreview')}</p>
              </div>
            </div>
          ) : previewHtml ? (
            <div className="border rounded-lg overflow-hidden bg-white shadow-inner">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[70vh]"
                title="HTML Preview"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">{t('loadingPreview')}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
