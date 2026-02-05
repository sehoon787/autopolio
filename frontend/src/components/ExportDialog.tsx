import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { exportApi, ExportReportType, ExportPreviewResponse, SingleProjectExportPreviewResponse } from '@/api/documents'
import type { AxiosResponse } from 'axios'
import { useUserStore } from '@/stores/userStore'
import {
  FileText,
  FileDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Eye,
} from 'lucide-react'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional project ID for single project export. If not provided, exports all projects. */
  projectId?: number
  /** Optional project name for display in single project mode */
  projectName?: string
}

export function ExportDialog({ open, onOpenChange, projectId, projectName }: ExportDialogProps) {
  const { t } = useTranslation('common')
  const { toast } = useToast()
  const { user } = useUserStore()
  const [reportType, setReportType] = useState<ExportReportType>('summary')
  const [exportFormat, setExportFormat] = useState<'markdown' | 'docx'>('markdown')
  const [includeCodeStats, setIncludeCodeStats] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const isSingleProject = !!projectId

  // Get export preview - different API for single project vs all projects
  type PreviewResponse = AxiosResponse<ExportPreviewResponse | SingleProjectExportPreviewResponse>
  const { data: previewData, isLoading: isLoadingPreview } = useQuery<PreviewResponse>({
    queryKey: isSingleProject
      ? ['export-preview-project', projectId, reportType, includeCodeStats]
      : ['export-preview', user?.id, reportType, includeCodeStats],
    queryFn: () => isSingleProject
      ? exportApi.getSingleProjectPreview(projectId!, reportType, includeCodeStats)
      : exportApi.getPreview(user!.id, reportType, includeCodeStats),
    enabled: open && (isSingleProject ? !!projectId : !!user?.id),
  })

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (isSingleProject) {
        if (exportFormat === 'markdown') {
          return exportApi.exportSingleProjectToMarkdown(projectId!, reportType, includeCodeStats)
        } else {
          return exportApi.exportSingleProjectToDocx(projectId!, reportType, includeCodeStats)
        }
      } else {
        if (exportFormat === 'markdown') {
          return exportApi.exportToMarkdown(user!.id, reportType, includeCodeStats)
        } else {
          return exportApi.exportToDocx(user!.id, reportType, includeCodeStats)
        }
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
        title: t('export.success'),
        description: filename,
      })
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast({
        title: t('export.failed'),
        description: error?.response?.data?.detail || t('export.error'),
        variant: 'destructive',
      })
    },
  })

  const preview = previewData?.data

  // Check if preview has data (works for both single project and all projects response)
  const hasData = isSingleProject
    ? !!(preview as any)?.project_id
    : !!(preview as any)?.project_count

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            {isSingleProject
              ? t('export.titleSingleProject', { name: projectName || '' })
              : t('export.title')}
          </DialogTitle>
          <DialogDescription>
            {isSingleProject
              ? t('export.descriptionSingleProject')
              : t('export.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preview Stats */}
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : preview ? (
            isSingleProject ? (
              // Single project stats
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {(preview as any).total_commits?.toLocaleString() || 0}
                  </div>
                  <div className="text-xs text-green-600">{t('export.totalCommits')}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {(preview as any).has_key_tasks ? (
                      <CheckCircle2 className="h-6 w-6 mx-auto" />
                    ) : (
                      <AlertCircle className="h-6 w-6 mx-auto" />
                    )}
                  </div>
                  <div className="text-xs text-purple-600">{t('export.keyTasks')}</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {(preview as any).has_achievements ? (
                      <CheckCircle2 className="h-6 w-6 mx-auto" />
                    ) : (
                      <AlertCircle className="h-6 w-6 mx-auto" />
                    )}
                  </div>
                  <div className="text-xs text-orange-600">{t('export.achievements')}</div>
                </div>
              </div>
            ) : (
              // All projects stats
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {(preview as any).project_count}
                  </div>
                  <div className="text-xs text-blue-600">{t('export.projectCount')}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {(preview as any).total_commits?.toLocaleString()}
                  </div>
                  <div className="text-xs text-green-600">{t('export.totalCommits')}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {(preview as any).has_key_tasks ? (
                      <CheckCircle2 className="h-6 w-6 mx-auto" />
                    ) : (
                      <AlertCircle className="h-6 w-6 mx-auto" />
                    )}
                  </div>
                  <div className="text-xs text-purple-600">{t('export.keyTasks')}</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {(preview as any).has_achievements ? (
                      <CheckCircle2 className="h-6 w-6 mx-auto" />
                    ) : (
                      <AlertCircle className="h-6 w-6 mx-auto" />
                    )}
                  </div>
                  <div className="text-xs text-orange-600">{t('export.achievements')}</div>
                </div>
              </div>
            )
          ) : null}

          {/* Report Type Selection */}
          <div className="space-y-3">
            <Label>{t('export.reportType')}</Label>
            <RadioGroup
              value={reportType}
              onValueChange={(value: string) => setReportType(value as ExportReportType)}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div>
                <RadioGroupItem
                  value="summary"
                  id="summary"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="summary"
                  className="flex flex-col items-start gap-2 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer h-full"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-semibold">{t('export.summary')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('export.summaryDesc')}
                  </span>
                </Label>
              </div>

              <div>
                <RadioGroupItem
                  value="final"
                  id="final"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="final"
                  className="flex flex-col items-start gap-2 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer h-full"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-semibold">{t('export.final')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('export.finalDesc')}
                  </span>
                </Label>
              </div>

              <div>
                <RadioGroupItem
                  value="detailed"
                  id="detailed"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="detailed"
                  className="flex flex-col items-start gap-2 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer h-full"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-semibold">{t('export.detailed')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('export.detailedDesc')}
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Export Format Selection */}
          <div className="space-y-3">
            <Label>{t('export.format')}</Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(value: string) => setExportFormat(value as 'markdown' | 'docx')}
              className="grid grid-cols-2 gap-3"
            >
              <div>
                <RadioGroupItem
                  value="markdown"
                  id="markdown"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="markdown"
                  className="flex items-center justify-center gap-2 rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  <span>Markdown (.md)</span>
                </Label>
              </div>

              <div>
                <RadioGroupItem
                  value="docx"
                  id="docx"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="docx"
                  className="flex items-center justify-center gap-2 rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  <span>Word (.docx)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Include Code Statistics Option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeCodeStats"
              checked={includeCodeStats}
              onCheckedChange={(checked) => setIncludeCodeStats(checked === true)}
            />
            <Label
              htmlFor="includeCodeStats"
              className="text-sm font-normal cursor-pointer"
            >
              {t('export.includeCodeStats')}
            </Label>
          </div>

          {/* Preview Toggle */}
          {preview && (preview as any).preview && (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? t('export.hidePreview') : t('export.showPreview')}
              </Button>

              {showPreview && (
                <ScrollArea className="h-[200px] mt-3 rounded-md border p-4">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {(preview as any).preview}
                  </pre>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !hasData}
          >
            {exportMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('export.exporting')}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {t('export.exportButton')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
