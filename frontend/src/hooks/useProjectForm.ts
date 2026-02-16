/**
 * useProjectForm - Hook for managing project form state
 * Handles both create and edit form logic with multi-repo support
 */

import { useState, useCallback } from 'react'
import { ProjectCreate, ProjectRepositoryCreate } from '@/api/knowledge'

const initialFormData: ProjectCreate = {
  name: '',
  short_description: '',
  description: '',
  start_date: '',
  end_date: '',
  team_size: undefined,
  role: '',
  contribution_percent: undefined,
  git_url: '',
  project_type: 'company',
  company_id: undefined,
  technologies: [],
  repositories: [],
}

export function useProjectForm(initial?: Partial<ProjectCreate>) {
  const [formData, setFormData] = useState<Partial<ProjectCreate>>(initial || initialFormData)
  const [techInput, setTechInput] = useState('')
  const [isOngoing, setIsOngoing] = useState(!initial?.end_date)

  const updateFormData = useCallback((data: Partial<ProjectCreate> | ((prev: Partial<ProjectCreate>) => Partial<ProjectCreate>)) => {
    if (typeof data === 'function') {
      setFormData(data)
    } else {
      setFormData(data)
    }
  }, [])

  const addTechnology = useCallback(() => {
    const trimmed = techInput.trim()
    if (trimmed && !formData.technologies?.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        technologies: [...(prev.technologies || []), trimmed],
      }))
      setTechInput('')
    }
  }, [techInput, formData.technologies])

  const removeTechnology = useCallback((tech: string) => {
    setFormData((prev) => ({
      ...prev,
      technologies: prev.technologies?.filter((t) => t !== tech),
    }))
  }, [])

  const handleOngoingChange = useCallback((ongoing: boolean) => {
    setIsOngoing(ongoing)
    if (ongoing) {
      setFormData((prev) => ({ ...prev, end_date: '' }))
    }
  }, [])

  // Multi-repo management
  const addRepository = useCallback((repo: ProjectRepositoryCreate) => {
    setFormData((prev) => {
      const repos = [...(prev.repositories || [])]
      // If this is the first repo, mark as primary
      if (repos.length === 0) {
        repo = { ...repo, is_primary: true }
      }
      repos.push(repo)
      // Also set git_url to primary repo for backward compat
      const primary = repos.find((r) => r.is_primary) || repos[0]
      return { ...prev, repositories: repos, git_url: primary?.git_url || prev.git_url }
    })
  }, [])

  const removeRepository = useCallback((index: number) => {
    setFormData((prev) => {
      const repos = [...(prev.repositories || [])]
      const wasRemovedPrimary = repos[index]?.is_primary
      repos.splice(index, 1)
      // If removed was primary, make first remaining primary
      if (wasRemovedPrimary && repos.length > 0) {
        repos[0] = { ...repos[0], is_primary: true }
      }
      const primary = repos.find((r) => r.is_primary) || repos[0]
      return { ...prev, repositories: repos, git_url: primary?.git_url || '' }
    })
  }, [])

  const updateRepository = useCallback((index: number, repo: Partial<ProjectRepositoryCreate>) => {
    setFormData((prev) => {
      const repos = [...(prev.repositories || [])]
      repos[index] = { ...repos[index], ...repo }
      const primary = repos.find((r) => r.is_primary) || repos[0]
      return { ...prev, repositories: repos, git_url: primary?.git_url || prev.git_url }
    })
  }, [])

  const setPrimaryRepository = useCallback((index: number) => {
    setFormData((prev) => {
      const repos = (prev.repositories || []).map((r, i) => ({
        ...r,
        is_primary: i === index,
      }))
      return { ...prev, repositories: repos, git_url: repos[index]?.git_url || prev.git_url }
    })
  }, [])

  const reset = useCallback(() => {
    setFormData(initialFormData)
    setTechInput('')
    setIsOngoing(false)
  }, [])

  const initializeFromProject = useCallback(
    (project: {
      name: string
      short_description?: string | null
      description?: string | null
      start_date?: string | null
      end_date?: string | null
      team_size?: number | null
      role?: string | null
      contribution_percent?: number | null
      git_url?: string | null
      project_type?: string | null
      company_id?: number | null
      technologies?: Array<{ name: string }> | null
      repositories?: Array<{
        id?: number
        git_url: string
        label?: string
        is_primary?: boolean
      }> | null
    }) => {
      // Build repositories from project data
      const repos: ProjectRepositoryCreate[] = (project.repositories || []).map((r) => ({
        git_url: r.git_url,
        label: r.label || undefined,
        is_primary: r.is_primary || false,
      }))

      // If no repositories but has git_url, create one
      if (repos.length === 0 && project.git_url) {
        repos.push({ git_url: project.git_url, is_primary: true })
      }

      setFormData({
        name: project.name,
        short_description: project.short_description || '',
        description: project.description || '',
        start_date: project.start_date || '',
        end_date: project.end_date || '',
        team_size: project.team_size ?? undefined,
        role: project.role || '',
        contribution_percent: project.contribution_percent ?? undefined,
        git_url: project.git_url || '',
        project_type: project.project_type || 'company',
        company_id: project.company_id ?? undefined,
        technologies: project.technologies?.map((t) => t.name) || [],
        repositories: repos,
      })
      setIsOngoing(!project.end_date)
      setTechInput('')
    },
    []
  )

  const getCleanedData = useCallback((): Partial<ProjectCreate> => {
    const repos = formData.repositories || []
    return {
      name: formData.name,
      short_description: formData.short_description || undefined,
      description: formData.description || undefined,
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      team_size: formData.team_size,
      role: formData.role || undefined,
      contribution_percent: formData.contribution_percent,
      git_url: formData.git_url || undefined,
      project_type: formData.project_type || undefined,
      company_id: formData.company_id,
      technologies: formData.technologies,
      repositories: repos.length > 0 ? repos : undefined,
    }
  }, [formData])

  return {
    formData,
    setFormData: updateFormData,
    techInput,
    setTechInput,
    isOngoing,
    setIsOngoing: handleOngoingChange,
    addTechnology,
    removeTechnology,
    addRepository,
    removeRepository,
    updateRepository,
    setPrimaryRepository,
    reset,
    initializeFromProject,
    getCleanedData,
  }
}
