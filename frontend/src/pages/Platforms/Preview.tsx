import { useState, useEffect, useCallback } from 'react'
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
  FileCode,
  FileText,
  File,
} from 'lucide-react'
import { platformsApi } from '@/api/platforms'
import { useUserStore } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { markdownToHtml, generateWordPreviewHtml } from '@/utils/markdownRenderer'

type PreviewFormat = 'html' | 'markdown' | 'word'

export default function PlatformPreviewPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation(['platforms', 'common'])
  const { user } = useUserStore()

  const [activeFormat, setActiveFormat] = useState<PreviewFormat>('html')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewMarkdown, setPreviewMarkdown] = useState<string>('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
  const loadHtmlPreview = useCallback(async () => {
    if (!template) return

    setIsPreviewLoading(true)
    try {
      // Try to render with user data if user exists
      if (user?.id) {
        try {
          const response = await platformsApi.renderFromDb(Number(templateId), user.id)
          if (response.data.html) {
            setPreviewHtml(response.data.html)
            return
          }
        } catch {
          // Fall through to sample data
        }
      }

      // Fall back to sample data
      const sampleResponse = await platformsApi.previewWithSampleData(Number(templateId))
      setPreviewHtml(sampleResponse.data.html)
    } catch {
      // Preview load failed - silently ignore as UI shows empty state
    } finally {
      setIsPreviewLoading(false)
    }
  }, [template, templateId, user?.id])

  // Load Markdown preview - tries user data first, falls back to sample data
  const loadMarkdownPreview = useCallback(async () => {
    if (!template) return

    setIsPreviewLoading(true)
    try {
      // Try to render with user data if user exists
      if (user?.id) {
        try {
          const response = await platformsApi.renderMarkdownFromDb(Number(templateId), user.id)
          if (response.data.markdown) {
            setPreviewMarkdown(response.data.markdown)
            return
          }
        } catch {
          // Fall through - Markdown sample data not yet supported
        }
      }
      // Note: Sample markdown not yet supported, will show empty state
    } catch {
      // Preview load failed - silently ignore as UI shows empty state
    } finally {
      setIsPreviewLoading(false)
    }
  }, [template, templateId, user?.id])

  // Load preview based on format
  useEffect(() => {
    if (!template) return

    if (activeFormat === 'html' && !previewHtml) {
      loadHtmlPreview()
    } else if (activeFormat === 'markdown' && !previewMarkdown) {
      loadMarkdownPreview()
    }
  }, [template, activeFormat, previewHtml, previewMarkdown, loadHtmlPreview, loadMarkdownPreview])

  const handlePrint = () => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      iframe.contentWindow.print()
    }
  }

  // Get Word-style preview HTML
  const getWordPreviewHtml = (): string => {
    if (!previewMarkdown) return ''
    return generateWordPreviewHtml(previewMarkdown)
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
            srcDoc={activeFormat === 'html' ? previewHtml : (activeFormat === 'markdown' ? markdownToHtml(previewMarkdown) : getWordPreviewHtml())}
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('previewWithYourData')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeFormat} onValueChange={(v) => setActiveFormat(v as PreviewFormat)}>
            <TabsList className="mb-4">
              <TabsTrigger value="html" className="flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                {t('formatHtml')}
              </TabsTrigger>
              <TabsTrigger value="markdown" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('formatMarkdown')}
              </TabsTrigger>
              <TabsTrigger value="word" className="flex items-center gap-2">
                <File className="h-4 w-4" />
                {t('formatWord')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="html">
              {isPreviewLoading && activeFormat === 'html' ? (
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
            </TabsContent>

            <TabsContent value="markdown">
              {isPreviewLoading && activeFormat === 'markdown' ? (
                <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">{t('loadingPreview')}</p>
                  </div>
                </div>
              ) : previewMarkdown ? (
                <div className="grid grid-cols-2 gap-4 h-[70vh]">
                  {/* Raw Markdown */}
                  <div className="border rounded-lg overflow-auto bg-gray-900 text-gray-100 p-4 font-mono text-sm">
                    <pre className="whitespace-pre-wrap">{previewMarkdown}</pre>
                  </div>
                  {/* Rendered Preview */}
                  <div className="border rounded-lg overflow-hidden bg-white shadow-inner">
                    <iframe
                      srcDoc={markdownToHtml(previewMarkdown)}
                      className="w-full h-full"
                      title="Markdown Preview"
                                          />
                  </div>
                </div>
              ) : !user?.id ? (
                <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">{t('loginRequired')}</p>
                    <p className="text-sm text-muted-foreground">{t('createUserFirst')}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">{t('noPreviewAvailable')}</p>
                    <p className="text-sm text-muted-foreground">{t('addProjectsFirst')}</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="word">
              {isPreviewLoading && activeFormat === 'word' ? (
                <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">{t('loadingPreview')}</p>
                  </div>
                </div>
              ) : previewMarkdown ? (
                <div className="border rounded-lg overflow-hidden bg-gray-100 p-4">
                  <div className="bg-white shadow-lg mx-auto" style={{ maxWidth: '210mm' }}>
                    <iframe
                      srcDoc={getWordPreviewHtml()}
                      className="w-full h-[70vh]"
                      title="Word Preview"
                                          />
                  </div>
                </div>
              ) : !user?.id ? (
                <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">{t('loginRequired')}</p>
                    <p className="text-sm text-muted-foreground">{t('createUserFirst')}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[70vh] bg-muted rounded-lg">
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">{t('noPreviewAvailable')}</p>
                    <p className="text-sm text-muted-foreground">{t('addProjectsFirst')}</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
