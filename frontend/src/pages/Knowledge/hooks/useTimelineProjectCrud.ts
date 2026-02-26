import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { projectsApi, companiesApi, ProjectCreate, Project } from '@/api/knowledge'
import { githubApi, GitHubRepo } from '@/api/github'
import { useProjectForm } from '@/hooks/useProjectForm'

export function useTimelineProjectCrud() {
  const { t } = useTranslation('projects')
  const { t: tc } = useTranslation('common')
  const { t: tco } = useTranslation('companies')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  // Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  // Link project dialog state
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkingCompanyId, setLinkingCompanyId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  // Form hooks
  const createForm = useProjectForm()
  const editForm = useProjectForm()

  // Loading state for repo info
  const [isLoadingRepoInfo, setIsLoadingRepoInfo] = useState(false)

  // GitHub connection check
  const isGitHubConnected = !!user?.github_username

  // Queries
  const { data: companiesData } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: () => companiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const { data: reposData } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id && isGitHubConnected,
  })

  // All projects query (for link dialog)
  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const companies = companiesData?.data || []
  const allProjects: Project[] = projectsData?.data?.projects || []
  const githubRepos: GitHubRepo[] = (reposData?.data?.repos || [])
    .slice()
    .sort((a: GitHubRepo, b: GitHubRepo) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const getUnlinkedProjects = (): Project[] => allProjects.filter(p => !p.company_id)

  // Invalidate both timeline and projects queries
  const invalidateQueries = () => {
    queryClient.refetchQueries({ queryKey: ['companies-grouped'] })
    queryClient.refetchQueries({ queryKey: ['projects'] })
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(user!.id, data),
    onSuccess: () => {
      invalidateQueries()
      setIsCreateDialogOpen(false)
      createForm.reset()
      toast({ title: t('projectAdded') })
    },
    onError: (error: any) => toast({ title: tc('error'), description: error?.response?.data?.detail || t('addFailed'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProjectCreate> }) => projectsApi.update(user!.id, id, data),
    onSuccess: () => {
      invalidateQueries()
      setEditingProjectId(null)
      toast({ title: t('projectUpdated') })
    },
    onError: (error: any) => toast({ title: tc('error'), description: error?.response?.data?.detail || t('updateFailed'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(user!.id, id),
    onSuccess: () => {
      invalidateQueries()
      setDeleteTarget(null)
      toast({ title: t('projectDeleted') })
    },
    onError: (error: any) => toast({ title: tc('error'), description: error?.response?.data?.detail || t('deleteFailed'), variant: 'destructive' }),
  })

  const linkProjectMutation = useMutation({
    mutationFn: ({ companyId, projectId }: { companyId: number; projectId: number }) =>
      companiesApi.linkProject(user!.id, companyId, projectId),
    onSuccess: () => {
      invalidateQueries()
      setIsLinkDialogOpen(false)
      setSelectedProjectId('')
      toast({ title: tco('projectLinked') })
    },
    onError: () => toast({ title: tc('error'), variant: 'destructive' }),
  })

  // Handlers
  const handleOpenLink = (companyId: number) => {
    setLinkingCompanyId(companyId)
    setSelectedProjectId('')
    setIsLinkDialogOpen(true)
  }

  const handleLinkProject = () => {
    if (linkingCompanyId && selectedProjectId) {
      linkProjectMutation.mutate({ companyId: linkingCompanyId, projectId: parseInt(selectedProjectId) })
    }
  }

  const handleOpenCreate = (companyId: number) => {
    createForm.reset()
    createForm.setFormData((prev) => ({ ...prev, company_id: companyId, project_type: 'company' }))
    setIsCreateDialogOpen(true)
  }

  const handleOpenEdit = async (projectId: number) => {
    if (!user?.id) return
    try {
      const response = await projectsApi.getById(user.id, projectId)
      editForm.initializeFromProject(response.data)
      setEditingProjectId(projectId)
    } catch {
      toast({ title: tc('error'), description: t('updateFailed'), variant: 'destructive' })
    }
  }

  const handleOpenDelete = (id: number, name: string) => {
    setDeleteTarget({ id, name })
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(createForm.getCleanedData() as ProjectCreate)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProjectId) return
    updateMutation.mutate({ id: editingProjectId, data: editForm.getCleanedData() })
  }

  const handleRepoSelected = async (repoUrl: string, form: ReturnType<typeof useProjectForm>) => {
    if (!repoUrl || !user?.id) return
    form.setFormData((prev) => ({ ...prev, git_url: repoUrl }))
    setIsLoadingRepoInfo(true)
    try {
      const [infoResponse, techResponse] = await Promise.all([
        githubApi.getRepoInfo(user.id, repoUrl),
        githubApi.detectTechnologies(user.id, repoUrl),
      ])
      const info = infoResponse.data
      const technologies = techResponse.data.technologies || []
      form.setFormData((prev) => ({
        ...prev,
        short_description: info.description || prev.short_description,
        git_url: info.html_url || repoUrl,
        start_date: info.start_date || prev.start_date,
        end_date: info.end_date || '',
        team_size: info.team_size || prev.team_size,
        contribution_percent: info.contribution_percent || prev.contribution_percent,
        technologies: technologies.length > 0 ? technologies : prev.technologies,
      }))
      form.setIsOngoing(!info.end_date)
      toast({ title: t('repoInfoLoaded') })
    } catch (error: any) {
      toast({ title: tc('error'), description: error?.response?.data?.detail || t('repoInfoFailed'), variant: 'destructive' })
    } finally {
      setIsLoadingRepoInfo(false)
    }
  }

  return {
    // Dialog state
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    editingProjectId,
    setEditingProjectId,
    deleteTarget,
    setDeleteTarget,

    // Forms
    createForm,
    editForm,

    // Data
    companies,
    githubRepos: isGitHubConnected ? githubRepos : undefined,
    isLoadingRepoInfo,

    // Mutations
    createMutation,
    updateMutation,
    deleteMutation,
    linkProjectMutation,

    // Link project
    isLinkDialogOpen,
    setIsLinkDialogOpen,
    linkingCompanyId,
    selectedProjectId,
    setSelectedProjectId,
    getUnlinkedProjects,

    // Handlers
    handleOpenCreate,
    handleOpenEdit,
    handleOpenDelete,
    handleOpenLink,
    handleLinkProject,
    handleCreateSubmit,
    handleEditSubmit,
    handleRepoSelected,

    // Translation
    t,
    tc,
    tco,
  }
}
