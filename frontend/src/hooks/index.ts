/**
 * Custom Hooks for Autopolio
 * 
 * This module exports reusable hooks for common patterns across the application.
 */

// CRUD operations hook for credential tabs
export {
  useCrudOperations,
  type BaseCredentialItem,
  type CredentialApi,
  type UseCrudOperationsOptions,
  type UseCrudOperationsReturn,
} from './useCrudOperations'

// Sortable list hook for credential tabs
export {
  useSortableList,
  type SortOption,
  type SortableItem,
  type DateFieldConfig,
  type UseSortableListOptions,
  type UseSortableListReturn,
  SORT_OPTIONS,
} from './useSortableList'

// Feature flags hook
export { useFeatureFlags } from './useFeatureFlags'

// Selection hook
export { useSelection } from './useSelection'

// Project form hook
export { useProjectForm } from './useProjectForm'

// GitHub CLI authentication hook
export {
  useGitHubCLIAuth,
  type UseGitHubCLIAuthOptions,
  type UseGitHubCLIAuthReturn,
} from './useGitHubCLIAuth'

// Autocomplete hook
export {
  useAutocomplete,
  type UseAutocompleteOptions,
  type UseAutocompleteReturn,
} from './useAutocomplete'
