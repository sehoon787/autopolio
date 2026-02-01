/**
 * ProjectFormFields - Shared form fields for project create/edit dialogs
 * Extracts common form UI to reduce duplication
 */

import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { TechBadge } from '@/components/ui/tech-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProjectCreate } from '@/api/knowledge'

interface Company {
  id: number
  name: string
}

export interface ProjectFormFieldsProps {
  formData: Partial<ProjectCreate>
  onChange: (data: Partial<ProjectCreate>) => void
  companies: Company[]
  techInput: string
  onTechInputChange: (value: string) => void
  onAddTechnology: () => void
  onRemoveTechnology: (tech: string) => void
  isOngoing: boolean
  onOngoingChange: (isOngoing: boolean) => void
  idPrefix?: string
}

export function ProjectFormFields({
  formData,
  onChange,
  companies,
  techInput,
  onTechInputChange,
  onAddTechnology,
  onRemoveTechnology,
  isOngoing,
  onOngoingChange,
  idPrefix = '',
}: ProjectFormFieldsProps) {
  const { t } = useTranslation('projects')
  const { t: tc } = useTranslation('common')

  const handleChange = <K extends keyof ProjectCreate>(
    key: K,
    value: ProjectCreate[K]
  ) => {
    onChange({ ...formData, [key]: value })
  }

  return (
    <>
      {/* Project Name */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}name`}>{t('dialog.projectName')} *</Label>
        <Input
          id={`${idPrefix}name`}
          value={formData.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={t('dialog.projectNamePlaceholder')}
          required
        />
        <p className="text-xs text-gray-500">{t('dialog.projectNameHint')}</p>
      </div>

      {/* Short Description */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}short_description`}>{t('dialog.shortDesc')}</Label>
        <Input
          id={`${idPrefix}short_description`}
          value={formData.short_description || ''}
          onChange={(e) => handleChange('short_description', e.target.value)}
          placeholder={t('dialog.shortDescPlaceholder')}
        />
      </div>

      {/* Project Type & Company */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('dialog.projectType')}</Label>
          <Select
            value={formData.project_type || 'company'}
            onValueChange={(v) => handleChange('project_type', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">{t('projectTypes.companyProject')}</SelectItem>
              <SelectItem value="personal">{t('projectTypes.personalProject')}</SelectItem>
              <SelectItem value="open-source">{t('projectTypes.openSource')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('dialog.company')}</Label>
          <Select
            value={formData.company_id?.toString() || ''}
            onValueChange={(v) => handleChange('company_id', v ? parseInt(v) : undefined)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('dialog.selectOptional')} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Start/End Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}start_date`}>{t('dialog.startDate')}</Label>
          <Input
            id={`${idPrefix}start_date`}
            type="date"
            value={formData.start_date || ''}
            max={formData.end_date || undefined}
            onChange={(e) => handleChange('start_date', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}end_date`}>{t('dialog.endDate')}</Label>
          <Input
            id={`${idPrefix}end_date`}
            type="date"
            value={formData.end_date || ''}
            min={formData.start_date || undefined}
            onChange={(e) => handleChange('end_date', e.target.value)}
            disabled={isOngoing}
            className={isOngoing ? 'bg-gray-100 cursor-not-allowed' : ''}
          />
        </div>
      </div>

      {/* Ongoing Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`${idPrefix}is_ongoing`}
          checked={isOngoing}
          onChange={(e) => {
            onOngoingChange(e.target.checked)
            if (e.target.checked) {
              handleChange('end_date', '')
            }
          }}
        />
        <Label htmlFor={`${idPrefix}is_ongoing`} className="cursor-pointer">
          {t('dialog.ongoingProject')}
        </Label>
      </div>

      {/* Role / Team Size / Contribution */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}role`}>{t('dialog.role')}</Label>
          <Input
            id={`${idPrefix}role`}
            value={formData.role || ''}
            onChange={(e) => handleChange('role', e.target.value)}
            placeholder={t('dialog.rolePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}team_size`}>{t('dialog.teamSize')}</Label>
          <Input
            id={`${idPrefix}team_size`}
            type="number"
            value={formData.team_size || ''}
            onChange={(e) =>
              handleChange('team_size', e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}contribution_percent`}>{t('dialog.contribution')}</Label>
          <Input
            id={`${idPrefix}contribution_percent`}
            type="number"
            min="0"
            max="100"
            value={formData.contribution_percent || ''}
            onChange={(e) =>
              handleChange(
                'contribution_percent',
                e.target.value ? parseInt(e.target.value) : undefined
              )
            }
            placeholder="70"
          />
        </div>
      </div>

      {/* Git URL */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}git_url`}>{t('dialog.githubUrl')}</Label>
        <Input
          id={`${idPrefix}git_url`}
          value={formData.git_url || ''}
          onChange={(e) => handleChange('git_url', e.target.value)}
          placeholder="https://github.com/username/repo"
        />
      </div>

      {/* Technologies */}
      <div className="space-y-2">
        <Label>{t('dialog.techStack')}</Label>
        <div className="flex gap-2">
          <Input
            value={techInput}
            onChange={(e) => onTechInputChange(e.target.value)}
            placeholder={t('dialog.techInputPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAddTechnology()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={onAddTechnology}>
            {tc('add')}
          </Button>
        </div>
        {formData.technologies && formData.technologies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.technologies.map((tech) => (
              <TechBadge
                key={tech}
                tech={tech}
                className="cursor-pointer hover:opacity-80"
                onClick={() => onRemoveTechnology(tech)}
              />
            ))}
            <span className="text-xs text-gray-500 self-center ml-1">
              ({t('dialog.clickToRemove')})
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}description`}>{t('dialog.description')}</Label>
        <Textarea
          id={`${idPrefix}description`}
          value={formData.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={4}
        />
      </div>
    </>
  )
}
