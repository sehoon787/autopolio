import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
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
import { ScrollToTop } from '@/components/ScrollToTop'
import { Plus, Pencil, Trash2, Building2, LayoutList } from 'lucide-react'

export default function CompaniesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
      toast({ title: t('companies:companyAdded') })
    },
    onError: () => toast({ title: t('common:error'), description: t('companies:addFailed'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CompanyCreate> }) =>
      companiesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setIsDialogOpen(false)
      setEditingCompany(null)
      resetForm()
      toast({ title: t('companies:companyUpdated') })
    },
    onError: () => toast({ title: t('common:error'), description: t('companies:updateFailed'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => companiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: t('companies:companyDeleted') })
    },
    onError: () => toast({ title: t('common:error'), description: t('companies:deleteFailed'), variant: 'destructive' }),
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
          <h1 className="text-3xl font-bold">{t('companies:title')}</h1>
          <p className="text-muted-foreground">{t('companies:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/knowledge/companies/timeline')}>
            <LayoutList className="h-4 w-4 mr-2" />
            {t('companies:timelineView')}
          </Button>
          <Button onClick={() => { resetForm(); setEditingCompany(null); setIsDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('companies:addCompany')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('companies:noCompanies')}</h3>
            <p className="text-muted-foreground mb-4">{t('companies:noCompaniesDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('companies:addFirstCompany')}
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
                      {company.is_current && <Badge variant="success">{t('companies:current')}</Badge>}
                    </div>
                    {company.position && (
                      <p className="font-medium">{company.position}</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(company.start_date)} ~ {company.end_date ? formatDate(company.end_date) : t('companies:current')}
                      {company.location && ` · ${company.location}`}
                    </p>
                    {company.description && (
                      <p className="text-muted-foreground mt-3">{company.description}</p>
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
                        if (confirm(t('companies:confirmDelete'))) {
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
            <DialogTitle>{editingCompany ? t('companies:editCompany') : t('companies:newCompany')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('companies:companyName')} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">{t('companies:position')}</Label>
                <Input
                  id="position"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">{t('companies:department')}</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">{t('companies:location')}</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('companies:startDate')}</Label>
                <DatePicker
                  value={formData.start_date || ''}
                  onChange={(value) => setFormData({ ...formData, start_date: value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('companies:endDate')}</Label>
                <DatePicker
                  value={formData.end_date || ''}
                  onChange={(value) => setFormData({ ...formData, end_date: value })}
                  disabled={formData.is_current}
                  className={formData.is_current ? 'opacity-50' : ''}
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
              <Label htmlFor="is_current">{t('companies:currentlyWorking')}</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('companies:description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingCompany ? t('common:edit') : t('common:add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ScrollToTop />
    </div>
  )
}
