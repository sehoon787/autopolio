/**
 * useProjectForm - Hook for managing project form state
 * Handles both create and edit form logic
 */

import { useState, useCallback } from 'react'
import { ProjectCreate } from '@/api/knowledge'

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
}

export function useProjectForm(initial?: Partial<ProjectCreate>) {
  const [formData, setFormData] = useState<Partial<ProjectCreate>>(initial || initialFormData)
  const [techInput, setTechInput] = useState('')
  const [isOngoing, setIsOngoing] = useState(!initial?.end_date)

  const updateFormData = useCallback((data: Partial<ProjectCreate>) => {
    setFormData(data)
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
    }) => {
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
      })
      setIsOngoing(!project.end_date)
      setTechInput('')
    },
    []
  )

  const getCleanedData = useCallback((): Partial<ProjectCreate> => {
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
    reset,
    initializeFromProject,
    getCleanedData,
  }
}
