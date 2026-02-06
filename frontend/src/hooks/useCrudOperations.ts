import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { AxiosResponse } from 'axios'

/**
 * Base interface for credential items with common fields
 */
export interface BaseCredentialItem {
  id: number
  user_id: number
  display_order: number
  created_at: string
  updated_at: string
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
}

/**
 * API interface that all credential APIs must implement
 */
export interface CredentialApi<TItem, TCreate> {
  getAll: (userId: number) => Promise<AxiosResponse<TItem[]>>
  create: (userId: number, data: TCreate) => Promise<AxiosResponse<TItem>>
  update: (userId: number, id: number, data: Partial<TCreate>) => Promise<AxiosResponse<TItem>>
  delete: (userId: number, id: number) => Promise<AxiosResponse<void>>
  reorder: (userId: number, itemIds: number[]) => Promise<AxiosResponse<TItem[]>>
}

/**
 * Configuration options for useCrudOperations hook
 */
export interface UseCrudOperationsOptions<TItem extends BaseCredentialItem, TCreate extends object> {
  /** Unique query key for TanStack Query */
  queryKey: string
  /** API object with CRUD methods */
  api: CredentialApi<TItem, TCreate>
  /** i18n namespace for messages (e.g., 'certifications', 'awards') */
  i18nKey: string
  /** Initial form data state */
  initialFormData: TCreate
  /** Function to map item to form data for editing */
  itemToFormData: (item: TItem) => TCreate
  /** Function to clean form data before submit (convert empty strings to undefined) */
  cleanFormData: (data: TCreate) => TCreate
}

/**
 * Return type for useCrudOperations hook
 */
export interface UseCrudOperationsReturn<TItem extends BaseCredentialItem, TCreate extends object> {
  // Data
  items: TItem[]
  isLoading: boolean
  
  // Dialog state
  isDialogOpen: boolean
  setIsDialogOpen: (open: boolean) => void
  editingItem: TItem | null
  
  // Form state
  formData: TCreate
  setFormData: React.Dispatch<React.SetStateAction<TCreate>>
  
  // Actions
  handleCreate: () => void
  handleEdit: (item: TItem) => void
  handleSubmit: (e: React.FormEvent) => void
  handleDelete: (id: number) => void
  resetForm: () => void
  
  // Mutation states
  isCreating: boolean
  isUpdating: boolean
  isDeleting: boolean
}

/**
 * Generic CRUD operations hook for credential tabs
 * 
 * Eliminates duplicate code across 8 credential tab files by providing:
 * - Standardized query/mutation setup with TanStack Query
 * - Dialog state management (open/close, editing item)
 * - Form state management (data, reset, submit)
 * - Toast notifications for success/error
 * 
 * @example
 * ```tsx
 * const crud = useCrudOperations({
 *   queryKey: 'certifications',
 *   api: certificationsApi,
 *   i18nKey: 'certifications',
 *   initialFormData: { name: '', issuer: '' },
 *   itemToFormData: (item) => ({ name: item.name, issuer: item.issuer || '' }),
 *   cleanFormData: (data) => ({ name: data.name, issuer: data.issuer || undefined }),
 * })
 * ```
 */
export function useCrudOperations<
  TItem extends BaseCredentialItem,
  TCreate extends object
>(
  options: UseCrudOperationsOptions<TItem, TCreate>
): UseCrudOperationsReturn<TItem, TCreate> {
  const { queryKey, api, i18nKey, initialFormData, itemToFormData, cleanFormData } = options
  
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TItem | null>(null)
  
  // Form state
  const [formData, setFormData] = useState<TCreate>(initialFormData)
  
  // Query
  const { data: itemsData, isLoading } = useQuery({
    queryKey: [queryKey, user?.id],
    queryFn: () => api.getAll(user!.id),
    enabled: !!user?.id,
  })
  
  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: TCreate) => api.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t(`credentials:${i18nKey}.added`) })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })
  
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TCreate> }) =>
      api.update(user!.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setIsDialogOpen(false)
      setEditingItem(null)
      resetForm()
      toast({ title: t(`credentials:${i18nKey}.updated`) })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })
  
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      toast({ title: t(`credentials:${i18nKey}.deleted`) })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })
  
  // Actions
  const resetForm = useCallback(() => {
    setFormData(initialFormData)
  }, [initialFormData])
  
  const handleCreate = useCallback(() => {
    resetForm()
    setEditingItem(null)
    setIsDialogOpen(true)
  }, [resetForm])
  
  const handleEdit = useCallback((item: TItem) => {
    setEditingItem(item)
    setFormData(itemToFormData(item))
    setIsDialogOpen(true)
  }, [itemToFormData])
  
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const cleanedData = cleanFormData(formData)
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }, [formData, editingItem, cleanFormData, createMutation, updateMutation])
  
  const handleDelete = useCallback((id: number) => {
    if (confirm(t('credentials:confirmDelete'))) {
      deleteMutation.mutate(id)
    }
  }, [deleteMutation, t])
  
  // Memoized items
  const items = useMemo(() => itemsData?.data || [], [itemsData?.data])
  
  return {
    // Data
    items,
    isLoading,
    
    // Dialog state
    isDialogOpen,
    setIsDialogOpen,
    editingItem,
    
    // Form state
    formData,
    setFormData,
    
    // Actions
    handleCreate,
    handleEdit,
    handleSubmit,
    handleDelete,
    resetForm,
    
    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
