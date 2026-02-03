import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { companiesApi, projectsApi, Company, CompanyCreate, Project } from '@/api/knowledge'
import { formatDate } from '@/lib/utils'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Plus, Pencil, Trash2, Building2, LayoutList, ChevronDown, ChevronRight, Link2, Unlink, ExternalLink, FolderOpen, Upload, X, ImageIcon } from 'lucide-react'

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

  const [expandedCompanies, setExpandedCompanies] = useState<Set<number>>(new Set())
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkingCompanyId, setLinkingCompanyId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  const { data: companiesData, isLoading } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: () => companiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  // Fetch all projects to show linked ones and for linking
  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id, { limit: 1000 }),
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
      companiesApi.update(user!.id, id, data),
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
    mutationFn: (id: number) => companiesApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: t('companies:companyDeleted') })
    },
    onError: () => toast({ title: t('common:error'), description: t('companies:deleteFailed'), variant: 'destructive' }),
  })

  const linkProjectMutation = useMutation({
    mutationFn: ({ companyId, projectId }: { companyId: number; projectId: number }) =>
      companiesApi.linkProject(user!.id, companyId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setLinkDialogOpen(false)
      setSelectedProjectId('')
      toast({ title: t('companies:projectLinked') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const unlinkProjectMutation = useMutation({
    mutationFn: ({ companyId, projectId }: { companyId: number; projectId: number }) =>
      companiesApi.unlinkProject(user!.id, companyId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({ title: t('companies:projectUnlinked') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: ({ companyId, file }: { companyId: number; file: File }) =>
      companiesApi.uploadLogo(user!.id, companyId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: t('companies:logoUploaded') })
    },
    onError: () => toast({ title: t('common:error'), description: t('companies:logoUploadFailed'), variant: 'destructive' }),
  })

  const deleteLogoMutation = useMutation({
    mutationFn: (companyId: number) => companiesApi.deleteLogo(user!.id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: t('companies:logoDeleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && editingCompany) {
      uploadLogoMutation.mutate({ companyId: editingCompany.id, file })
    }
  }

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
  const allProjects = projectsData?.data?.projects || []

  // Get projects linked to a specific company
  const getLinkedProjects = (companyId: number): Project[] => {
    return allProjects.filter(p => p.company_id === companyId)
  }

  // Get unlinked projects (not linked to any company)
  const getUnlinkedProjects = (): Project[] => {
    return allProjects.filter(p => !p.company_id)
  }

  const toggleCompanyExpand = (companyId: number) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev)
      if (next.has(companyId)) {
        next.delete(companyId)
      } else {
        next.add(companyId)
      }
      return next
    })
  }

  const openLinkDialog = (companyId: number) => {
    setLinkingCompanyId(companyId)
    setSelectedProjectId('')
    setLinkDialogOpen(true)
  }

  const handleLinkProject = () => {
    if (linkingCompanyId && selectedProjectId) {
      linkProjectMutation.mutate({
        companyId: linkingCompanyId,
        projectId: parseInt(selectedProjectId)
      })
    }
  }

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
          {companies.map((company) => {
            const linkedProjects = getLinkedProjects(company.id)
            const isExpanded = expandedCompanies.has(company.id)

            return (
              <Card key={company.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Company Logo */}
                      <div className="shrink-0">
                        {company.logo_path ? (
                          <img
                            src={companiesApi.getLogoUrl(user!.id, company.id)}
                            alt={company.name}
                            className="w-14 h-14 rounded-lg object-cover border"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-7 w-7 text-primary" />
                          </div>
                        )}
                      </div>
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

                  {/* Projects section */}
                  <Collapsible open={isExpanded} onOpenChange={() => toggleCompanyExpand(company.id)}>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <FolderOpen className="h-4 w-4" />
                            <span>{t('companies:projects')} ({linkedProjects.length})</span>
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLinkDialog(company.id)}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        {t('companies:linkProject')}
                      </Button>
                    </div>

                    <CollapsibleContent className="mt-3">
                      {linkedProjects.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">{t('companies:noLinkedProjects')}</p>
                      ) : (
                        <div className="space-y-2 pl-6">
                          {linkedProjects.map((project) => (
                            <div
                              key={project.id}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{project.name}</span>
                                  {project.technologies && project.technologies.length > 0 && (
                                    <div className="flex gap-1">
                                      {project.technologies.slice(0, 3).map((tech) => (
                                        <Badge key={tech.id} variant="outline" className="text-xs">
                                          {tech.name}
                                        </Badge>
                                      ))}
                                      {project.technologies.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{project.technologies.length - 3}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : t('companies:current')}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => navigate(`/knowledge/projects/${project.id}`)}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    if (confirm(t('companies:confirmUnlink'))) {
                                      unlinkProjectMutation.mutate({
                                        companyId: company.id,
                                        projectId: project.id
                                      })
                                    }
                                  }}
                                >
                                  <Unlink className="h-4 w-4 text-orange-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCompany ? t('companies:editCompany') : t('companies:newCompany')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                    src={companiesApi.getLogoUrl(user!.id, editingCompany.id)}
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

      {/* Link Project Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('companies:linkProjectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('companies:selectProject')}</Label>
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('companies:selectProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {getUnlinkedProjects().map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                      {project.start_date && ` (${formatDate(project.start_date)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getUnlinkedProjects().length === 0 && (
                <p className="text-sm text-muted-foreground">{t('companies:noUnlinkedProjects')}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              onClick={handleLinkProject}
              disabled={!selectedProjectId || linkProjectMutation.isPending}
            >
              {t('companies:link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScrollToTop />
    </div>
  )
}
