import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { attachmentsApi, CredentialType } from '@/api/credentials'
import { Upload, Paperclip, Download, Trash2, Loader2 } from 'lucide-react'

interface AttachmentUploadProps {
  userId: number
  credentialType: CredentialType
  credentialId: number
  attachmentPath: string | null
  attachmentName: string | null
  attachmentSize: number | null
  /** "full" for modal (upload/download/delete), "compact" for list (download only) */
  mode?: 'full' | 'compact'
  onUploadSuccess?: () => void
  onDeleteSuccess?: () => void
}

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentUpload({
  userId,
  credentialType,
  credentialId,
  attachmentPath,
  attachmentName,
  attachmentSize,
  mode = 'full',
  onUploadSuccess,
  onDeleteSuccess,
}: AttachmentUploadProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(userId, credentialType, credentialId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [credentialType] })
      toast({ title: t('credentials:attachment.uploaded') })
      onUploadSuccess?.()
    },
    onError: () => {
      toast({ title: t('common:error'), description: t('credentials:attachment.uploadFailed'), variant: 'destructive' })
    },
    onSettled: () => setIsUploading(false),
  })

  const deleteMutation = useMutation({
    mutationFn: () => attachmentsApi.delete(userId, credentialType, credentialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [credentialType] })
      toast({ title: t('credentials:attachment.deleted') })
      onDeleteSuccess?.()
    },
    onError: () => {
      toast({ title: t('common:error'), description: t('credentials:attachment.deleteFailed'), variant: 'destructive' })
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setIsUploading(true)
      uploadMutation.mutate(file)
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDownload = () => {
    const url = attachmentsApi.getDownloadUrl(userId, credentialType, credentialId)
    window.open(url, '_blank')
  }

  const handleDelete = () => {
    if (confirm(t('credentials:attachment.confirmDelete'))) {
      deleteMutation.mutate()
    }
  }

  // Compact mode - just show download link if file exists
  if (mode === 'compact') {
    if (!attachmentPath) return null

    return (
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 hover:underline"
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span className="truncate max-w-[200px]">{attachmentName}</span>
      </button>
    )
  }

  // Full mode - upload/download/delete
  if (attachmentPath) {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm truncate" title={attachmentName || ''}>
          {attachmentName}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(attachmentSize)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDownload}
          title={t('credentials:attachment.download')}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          title={t('credentials:attachment.delete')}
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.docx,.zip"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('credentials:attachment.uploading')}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            {t('credentials:attachment.upload')}
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground mt-1">
        {t('credentials:attachment.allowedTypes')}
      </p>
    </div>
  )
}
