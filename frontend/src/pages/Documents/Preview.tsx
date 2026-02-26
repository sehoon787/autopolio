import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { documentsApi } from '@/api/documents'
import { formatDateTime, formatFileSize } from '@/lib/utils'
import { ArrowLeft, Download, FileText, Eye } from 'lucide-react'

export default function DocumentPreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation('documents')

  const documentId = parseInt(id || '0')

  const { data: documentData, isLoading } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => documentsApi.getById(documentId),
    enabled: !!documentId,
  })

  const { data: previewData } = useQuery({
    queryKey: ['document-preview', documentId],
    queryFn: () => documentsApi.preview(documentId),
    enabled: !!documentId,
  })

  const { data: versionsData } = useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: () => documentsApi.getVersions(documentId),
    enabled: !!documentId,
  })

  const document = documentData?.data
  const preview = previewData?.data
  const versions = versionsData?.data?.versions || []

  if (isLoading) {
    return <div className="text-center py-8">{t('previewPage.loading')}</div>
  }

  if (!document) {
    return <div className="text-center py-8">{t('previewPage.notFound')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{document.document_name}</h1>
            <Badge>{document.file_format?.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
            <span>{t('previewPage.createdAt', { date: formatDateTime(document.created_at) })}</span>
            {document.file_size && <span>{t('previewPage.fileSize', { size: formatFileSize(document.file_size) })}</span>}
          </div>
        </div>
        <Button
          onClick={() => window.open(documentsApi.getDownloadUrl(document.id), '_blank')}
        >
          <Download className="h-4 w-4 mr-2" />
          {t('previewPage.download')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Preview */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t('previewPage.preview')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview?.preview_available && preview.content ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{preview.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="mb-4">
                  {preview?.message || t('previewPage.noPreview', { format: document.file_format?.toUpperCase() })}
                </p>
                <Button
                  variant="outline"
                  onClick={() => window.open(documentsApi.getDownloadUrl(document.id), '_blank')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('previewPage.downloadToView')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('previewPage.documentInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-sm text-gray-500">{t('previewPage.includedProjects')}</span>
                <p className="font-medium">
                  {t('previewPage.projectCount', { count: document.included_projects?.length || 0 })}
                </p>
              </div>
              {document.generation_settings && (
                <>
                  <div>
                    <span className="text-sm text-gray-500">{t('previewPage.summaryStyle')}</span>
                    <p className="font-medium">
                      {document.generation_settings.summary_style as string || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">{t('previewPage.includeAchievements')}</span>
                    <p className="font-medium">
                      {document.generation_settings.include_achievements ? t('common:yes') : t('common:no')}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {versions.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('previewPage.versionHistory')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className={`p-2 rounded ${
                        version.id === document.id
                          ? 'bg-primary/10'
                          : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                      onClick={() => {
                        if (version.id !== document.id) {
                          navigate(`/documents/${version.id}`)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">v{version.version}</span>
                        {version.id === document.id && (
                          <Badge variant="secondary">{t('previewPage.current')}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(version.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
