import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { documentsApi } from '@/api/documents'
import { formatDateTime, formatFileSize } from '@/lib/utils'
import { FileText, Download, Trash2, Eye, Archive, Plus } from 'lucide-react'

export default function DocumentsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  const { data: documentsData, isLoading } = useQuery({
    queryKey: ['documents', user?.id],
    queryFn: () => documentsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({ title: '문서가 삭제되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '삭제에 실패했습니다.', variant: 'destructive' }),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => documentsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({ title: '문서가 보관되었습니다.' })
    },
  })

  const documents = documentsData?.data?.documents || []

  const getFormatIcon = (_format: string | null) => {
    return <FileText className="h-8 w-8 text-gray-400" />
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">완료</Badge>
      case 'draft':
        return <Badge variant="secondary">임시저장</Badge>
      case 'archived':
        return <Badge variant="outline">보관됨</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">생성된 문서</h1>
          <p className="text-gray-600">생성된 이력서/포트폴리오 문서를 관리합니다.</p>
        </div>
        <Link to="/generate">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            새 문서 생성
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-8">로딩 중...</div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">생성된 문서가 없습니다</h3>
            <p className="text-gray-500 mb-4">프로젝트를 선택하고 문서를 생성해보세요.</p>
            <Link to="/generate">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                첫 문서 생성
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
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
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{formatDateTime(doc.created_at)}</span>
                      {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                      {doc.included_projects && (
                        <span>{doc.included_projects.length}개 프로젝트</span>
                      )}
                      {doc.version > 1 && <span>v{doc.version}</span>}
                    </div>
                    {doc.description && (
                      <p className="text-gray-600 mt-2 text-sm">{doc.description}</p>
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
                        if (confirm('정말 삭제하시겠습니까?')) {
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
    </div>
  )
}
