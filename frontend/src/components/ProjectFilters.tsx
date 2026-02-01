/**
 * ProjectFilters - Filter panel for projects list
 * Extracts filter UI from Projects.tsx
 */

import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { ProjectFilters as ProjectFiltersType } from '@/api/knowledge'

interface Company {
  id: number
  name: string
}

interface ProjectFiltersProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  filters: ProjectFiltersType
  onFiltersChange: (filters: ProjectFiltersType) => void
  companies: Company[]
}

export function ProjectFilters({
  isOpen,
  onOpenChange,
  filters,
  onFiltersChange,
  companies,
}: ProjectFiltersProps) {
  const { t } = useTranslation('projects')

  const updateFilter = <K extends keyof ProjectFiltersType>(
    key: K,
    value: ProjectFiltersType[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleContent>
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Company Filter */}
            <div className="space-y-2">
              <Label>{t('filters.company')}</Label>
              <Select
                value={filters.company_id?.toString() || 'all'}
                onValueChange={(v) =>
                  updateFilter('company_id', v === 'all' ? undefined : parseInt(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.all')}</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project Type Filter */}
            <div className="space-y-2">
              <Label>{t('filters.projectType')}</Label>
              <Select
                value={filters.project_type || 'all'}
                onValueChange={(v) =>
                  updateFilter('project_type', v === 'all' ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.all')}</SelectItem>
                  <SelectItem value="company">{t('projectTypes.companyProject')}</SelectItem>
                  <SelectItem value="personal">{t('projectTypes.personalProject')}</SelectItem>
                  <SelectItem value="open-source">{t('projectTypes.openSource')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>{t('filters.status')}</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) =>
                  updateFilter('status', v === 'all' ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.all')}</SelectItem>
                  <SelectItem value="pending">{t('status.pending')}</SelectItem>
                  <SelectItem value="analyzing">{t('status.analyzing')}</SelectItem>
                  <SelectItem value="review">{t('status.review')}</SelectItem>
                  <SelectItem value="completed">{t('status.completed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Analyzed Filter */}
            <div className="space-y-2">
              <Label>{t('filters.analyzed')}</Label>
              <Select
                value={filters.is_analyzed === undefined ? 'all' : filters.is_analyzed.toString()}
                onValueChange={(v) =>
                  updateFilter('is_analyzed', v === 'all' ? undefined : v === 'true')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.all')}</SelectItem>
                  <SelectItem value="true">{t('analyzed')}</SelectItem>
                  <SelectItem value="false">{t('notAnalyzed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date From */}
            <div className="space-y-2">
              <Label>{t('filters.startDateFrom')}</Label>
              <Input
                type="date"
                value={filters.start_date_from || ''}
                onChange={(e) =>
                  updateFilter('start_date_from', e.target.value || undefined)
                }
              />
            </div>

            {/* Start Date To */}
            <div className="space-y-2">
              <Label>{t('filters.startDateTo')}</Label>
              <Input
                type="date"
                value={filters.start_date_to || ''}
                onChange={(e) =>
                  updateFilter('start_date_to', e.target.value || undefined)
                }
              />
            </div>

            {/* Technologies Filter */}
            <div className="space-y-2 col-span-2">
              <Label>{t('filters.techStack')}</Label>
              <Input
                placeholder="React, TypeScript, Node.js..."
                value={filters.technologies || ''}
                onChange={(e) =>
                  updateFilter('technologies', e.target.value || undefined)
                }
              />
            </div>
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Utility function to count active filters
export function countActiveFilters(filters: ProjectFiltersType): number {
  let count = 0
  if (filters.company_id) count++
  if (filters.project_type) count++
  if (filters.status) count++
  if (filters.is_analyzed !== undefined) count++
  if (filters.start_date_from) count++
  if (filters.start_date_to) count++
  if (filters.technologies) count++
  if (filters.search) count++
  return count
}
