import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { companiesApi, Company, CompanyCreate } from '@/api/knowledge'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react'

export default function CompaniesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [formData, setFormData] = useState<CompanyCreate>({
    name: '',
    position: '',
    department: '',
    employment_type: 'full-time',
    start_date: '',
    end_date: '',
    is_current: false,
    description: '',
    location: '',
  })

  const { data: companiesData, isLoading } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: () => companiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: CompanyCreate) => companiesApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: '회사가 추가되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '회사 추가에 실패했습니다.', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CompanyCreate> }) =>
      companiesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setIsDialogOpen(false)
      setEditingCompany(null)
      resetForm()
      toast({ title: '회사 정보가 수정되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '수정에 실패했습니다.', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => companiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: '회사가 삭제되었습니다.' })
    },
    onError: () => toast({ title: '오류', description: '삭제에 실패했습니다.', variant: 'destructive' }),
  })

  const resetForm = () => {
    setFormData({
      name: '',
      position: '',
      department: '',
      employment_type: 'full-time',
      start_date: '',
      end_date: '',
      is_current: false,
      description: '',
      location: '',
    })
  }

  const handleEdit = (company: Company) => {
    setEditingCompany(company)
    setFormData({
      name: company.name,
      position: company.position || '',
      department: company.department || '',
      employment_type: company.employment_type || 'full-time',
      start_date: company.start_date || '',
      end_date: company.end_date || '',
      is_current: company.is_current,
      description: company.description || '',
      location: company.location || '',
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Clean up empty strings to undefined for optional fields
    const cleanedData: CompanyCreate = {
      name: formData.name,
      position: formData.position || undefined,
      department: formData.department || undefined,
      employment_type: formData.employment_type || undefined,
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      is_current: formData.is_current,
      description: formData.description || undefined,
      location: formData.location || undefined,
    }
    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }

  const companies = companiesData?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">회사 관리</h1>
          <p className="text-gray-600">경력 사항을 관리합니다.</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingCompany(null); setIsDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          회사 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">로딩 중...</div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">등록된 회사가 없습니다</h3>
            <p className="text-gray-500 mb-4">경력 사항을 추가해주세요.</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              첫 회사 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {companies.map((company) => (
            <Card key={company.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">{company.name}</h3>
                      {company.is_current && <Badge variant="success">재직중</Badge>}
                    </div>
                    {company.position && (
                      <p className="text-gray-700 font-medium">{company.position}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      {formatDate(company.start_date)} ~ {company.end_date ? formatDate(company.end_date) : '현재'}
                      {company.location && ` · ${company.location}`}
                    </p>
                    {company.description && (
                      <p className="text-gray-600 mt-3">{company.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(company)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('정말 삭제하시겠습니까?')) {
                          deleteMutation.mutate(company.id)
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCompany ? '회사 수정' : '새 회사 추가'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">회사명 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">직책</Label>
                <Input
                  id="position"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">부서</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">위치</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">시작일</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">종료일</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  disabled={formData.is_current}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_current"
                checked={formData.is_current}
                onChange={(e) => setFormData({ ...formData, is_current: e.target.checked, end_date: '' })}
              />
              <Label htmlFor="is_current">현재 재직중</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingCompany ? '수정' : '추가'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
