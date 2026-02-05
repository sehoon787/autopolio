import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { documentsApi } from '@/api/documents'
import { formatDateTime, formatFileSize } from '@/lib/utils'
import { ScrollToTop } from '@/components/ScrollToTop'
import { FileText, Download, Trash2, Eye, Archive, Plus, CheckSquare, Square, Loader2 } from 'lucide-react'

export default function DocumentsPage() {
  const { t } = useTranslation('documents')
  const { t: tc } = useTranslation('common')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)

  const { data: documentsData, isLoading } = useQuery({
    queryKey: ['documents', user?.id],
    queryFn: () => documentsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentsApi.delete(id),
    onSuccess: () => {
      // Use exact queryKey match to ensure list updates
      queryClient.invalidateQueries({ queryKey: ['documents', user?.id] })
      toast({ title: t('documentDeleted') })
    },
    onError: () => toast({ title: tc('error'), description: t('deleteError'), variant: 'destructive' }),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => documentsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', user?.id] })
      toast({ title: t('documentArchived') })
    },
  })

  const documents = documentsData?.data?.documents || []

  // Selection handlers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(documents.map(d => d.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const isAllSelected = documents.length > 0 && selectedIds.size === documents.length
  const hasSelection = selectedIds.size > 0

  // Bulk delete
  const handleBulkDelete = async () => {
    if (!confirm(t('confirmBulkDelete', { count: selectedIds.size }))) return

    setIsBulkDeleting(true)
    try {
      const deletePromises = Array.from(selectedIds).map(id => documentsApi.delete(id))
      await Promise.all(deletePromises)

      queryClient.invalidateQueries({ queryKey: ['documents', user?.id] })
      toast({ title: t('bulkDeleteSuccess', { count: selectedIds.size }) })
      setSelectedIds(new Set())
    } catch {
      toast({ title: tc('error'), description: t('bulkDeleteError'), variant: 'destructive' })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  // Bulk download
  const handleBulkDownload = async () => {
    setIsBulkDownloading(true)
    try {
      // Download files sequentially with a small delay to prevent overwhelming the browser
      for (const id of selectedIds) {
        const url = documentsApi.getDownloadUrl(id)
        const link = document.createElement('a')
        link.href = url
        link.download = ''
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      toast({ title: t('bulkDownloadStarted', { count: selectedIds.size }) })
    } catch {
      toast({ title: tc('error'), description: t('bulkDownloadError'), variant: 'destructive' })
    } finally {
      setIsBulkDownloading(false)
    }
  }

  const getFormatIcon = (_format: string | null) => {
    return <FileText className="h-8 w-8 text-gray-400" />
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">{t('status.completed')}</Badge>
      case 'draft':
        return <Badge variant="secondary">{t('status.draft')}</Badge>
      case 'archived':
        return <Badge variant="outline">{t('status.archived')}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
        </div>
        <Link to="/generate">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('newDocument')}
          </Button>
        </Link>
      </div>

      {/* Bulk actions bar */}
      {documents.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={isAllSelected ? deselectAll : selectAll}
            className="gap-2"
          >
            {isAllSelected ? (
              <>
                <CheckSquare className="h-4 w-4" />
                {t('deselectAll')}
              </>
            ) : (
              <>
                <Square className="h-4 w-4" />
                {t('selectAll')}
              </>
            )}
          </Button>

          {hasSelection && (
            <>
              <span className="text-sm text-muted-foreground">
                {t('selectedCount', { count: selectedIds.size })}
              </span>

              <div className="flex-1" />

              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDownload}
                disabled={isBulkDownloading}
                className="gap-2"
              >
                {isBulkDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t('downloadSelected')}
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="gap-2"
              >
                {isBulkDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t('deleteSelected')}
              </Button>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">{tc('loading')}</div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('noDocuments')}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t('noDocumentsDesc')}</p>
            <Link to="/generate">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('firstDocument')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className={`hover:shadow-md transition-shadow ${selectedIds.has(doc.id) ? 'ring-2 ring-primary' : ''}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedIds.has(doc.id)}
                    onCheckedChange={() => toggleSelect(doc.id)}
                    className="h-5 w-5"
                  />

                  {getFormatIcon(doc.file_format)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="font-semibold text-lg hover:text-primary hover:underline"
                      >
                        {doc.document_name}
                      </Link>
                      {getStatusBadge(doc.status)}
                      <Badge variant="outline">{doc.file_format?.toUpperCase()}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>{formatDateTime(doc.created_at)}</span>
                      {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                      {doc.included_projects && (
                        <span>{t('projectsIncluded', { count: doc.included_projects.length })}</span>
                      )}
                      {doc.version > 1 && <span>v{doc.version}</span>}
                    </div>
                    {doc.description && (
                      <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm">{doc.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/documents/${doc.id}`}>
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(documentsApi.getDownloadUrl(doc.id), '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {doc.status !== 'archived' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => archiveMutation.mutate(doc.id)}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(tc('confirmDelete'))) {
                          deleteMutation.mutate(doc.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ScrollToTop />
    </div>
  )
}
