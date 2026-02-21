import { useRef } from 'react'
import { TFunction } from 'i18next'
import { UseMutationResult } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { companiesApi, Company, CompanyCreate } from '@/api/knowledge'
import { Upload, X, ImageIcon } from 'lucide-react'

interface CompanyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingCompany: Company | null
  formData: CompanyCreate & { is_current: boolean }
  setFormData: (data: CompanyCreate & { is_current: boolean }) => void
  onSubmit: (e: React.FormEvent) => void
  userId: number
  isSubmitting: boolean
  uploadLogoMutation: UseMutationResult<unknown, Error, { companyId: number; file: File }>
  deleteLogoMutation: UseMutationResult<unknown, Error, number>
  t: TFunction
}

export default function CompanyFormDialog({
  open,
  onOpenChange,
  editingCompany,
  formData,
  setFormData,
  onSubmit,
  userId,
  isSubmitting,
  uploadLogoMutation,
  deleteLogoMutation,
  t,
}: CompanyFormDialogProps) {
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && editingCompany) {
      uploadLogoMutation.mutate({ companyId: editingCompany.id, file })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingCompany ? t('companies:editCompany') : t('companies:newCompany')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Logo Upload - Compact, only when editing */}
          {editingCompany && (
            <div className="flex items-center gap-3 pb-2 border-b">
              <input
                ref={logoInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
                onChange={handleLogoSelect}
                className="hidden"
              />
              {editingCompany.logo_path ? (
                <img
                  src={companiesApi.getLogoUrl(userId, editingCompany.id)}
                  alt={editingCompany.name}
                  className="w-10 h-10 rounded object-cover border cursor-pointer hover:opacity-80"
                  onClick={() => logoInputRef.current?.click()}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded bg-muted flex items-center justify-center border-2 border-dashed cursor-pointer hover:border-primary/50"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadLogoMutation.isPending}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {editingCompany.logo_path ? t('companies:changeLogo') : t('companies:uploadLogo')}
                </Button>
                {editingCompany.logo_path && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-500 hover:text-red-600"
                    onClick={() => {
                      if (confirm(t('companies:confirmDeleteLogo'))) {
                        deleteLogoMutation.mutate(editingCompany.id)
                      }
                    }}
                    disabled={deleteLogoMutation.isPending}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

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
              <Input
                id="start_date"
                type="date"
                value={formData.start_date || ''}
                max={formData.end_date || undefined}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">{t('companies:endDate')}</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date || ''}
                min={formData.start_date || undefined}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {editingCompany ? t('common:edit') : t('common:add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
