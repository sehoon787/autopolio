import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, ChevronDown, User, Briefcase, FolderKanban } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { FieldInfo, AvailableFieldsResponse } from '@/api/templates'

// Field Item Component - single clickable field
interface FieldItemProps {
  field: FieldInfo
  onInsert: (field: string, isSection?: boolean) => void
}

function FieldItem({ field, onInsert }: FieldItemProps) {
  return (
    <button
      onClick={() => onInsert(field.field, field.is_section)}
      className="flex items-center gap-2 text-sm p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded w-full text-left transition-colors"
    >
      <Copy className="h-3 w-3 text-gray-400 flex-shrink-0" />
      <span className="font-mono text-blue-600 dark:text-blue-400 text-xs">
        {field.is_section ? `{{#${field.field}}}` : `{{${field.field}}}`}
      </span>
      <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{field.description}</span>
    </button>
  )
}

// Field Group Component - collapsible group of fields
interface FieldGroupProps {
  title: string
  icon: React.ReactNode
  fields?: FieldInfo[]
  subGroups?: { title: string; fields?: FieldInfo[] }[]
  onInsertField: (field: string, isSection?: boolean) => void
  defaultOpen?: boolean
}

function FieldGroup({ title, icon, fields, subGroups, onInsertField, defaultOpen = false }: FieldGroupProps) {
  const hasFields = fields && fields.length > 0
  const hasSubGroups = subGroups && subGroups.some(g => g.fields && g.fields.length > 0)

  if (!hasFields && !hasSubGroups) return null

  return (
    <Collapsible defaultOpen={defaultOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            {icon}
          </div>
          <span className="font-medium">{title}</span>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <div className="p-4 space-y-4">
          {/* Direct fields */}
          {hasFields && (
            <div className="grid gap-1">
              {fields.map((field) => (
                <FieldItem key={field.field} field={field} onInsert={onInsertField} />
              ))}
            </div>
          )}

          {/* Sub groups */}
          {hasSubGroups && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {subGroups.map((group) => {
                if (!group.fields || group.fields.length === 0) return null
                return (
                  <div key={group.title} className="space-y-2">
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 border-b pb-1">
                      {group.title}
                    </h5>
                    <div className="space-y-1">
                      {group.fields.map((field) => (
                        <FieldItem key={field.field} field={field} onInsert={onInsertField} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Available Fields Panel - grouped field selection sidebar
interface AvailableFieldsPanelProps {
  fieldsData: AvailableFieldsResponse | undefined
  onInsertField: (field: string, isSection?: boolean) => void
}

export function AvailableFieldsPanel({ fieldsData, onInsertField }: AvailableFieldsPanelProps) {
  const { t } = useTranslation('templates')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('availableFields')}
          <span className="text-sm font-normal text-gray-500">
            {t('editor.clickToInsert')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Group 1: 기본 정보 (User Info) */}
        <FieldGroup
          title={t('fieldGroups.basicInfo')}
          icon={<User className="h-4 w-4 text-primary" />}
          fields={fieldsData?.user_fields}
          onInsertField={onInsertField}
          defaultOpen={true}
        />

        {/* Group 2: 이력 관리 (Career Management) - matches sidebar "이력 관리" */}
        <FieldGroup
          title={t('fieldGroups.careerManagement')}
          icon={<Briefcase className="h-4 w-4 text-primary" />}
          subGroups={[
            { title: t('companyFields'), fields: fieldsData?.company_fields },
            { title: t('certificationFields'), fields: fieldsData?.certification_fields },
            { title: t('awardFields'), fields: fieldsData?.award_fields },
            { title: t('educationFields'), fields: fieldsData?.education_fields },
            { title: t('publicationFields'), fields: fieldsData?.publication_fields },
            { title: t('volunteerActivityFields'), fields: fieldsData?.volunteer_activity_fields },
          ]}
          onInsertField={onInsertField}
        />

        {/* Group 3: 프로젝트 (Projects) - matches sidebar "프로젝트 관리" */}
        <FieldGroup
          title={t('fieldGroups.projectManagement')}
          icon={<FolderKanban className="h-4 w-4 text-primary" />}
          subGroups={[
            { title: t('projectFields'), fields: fieldsData?.project_fields },
            { title: t('achievementFields'), fields: fieldsData?.achievement_fields },
          ]}
          onInsertField={onInsertField}
        />

        {/* Syntax Guide */}
        {fieldsData?.syntax_guide && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="font-medium mb-2 text-sm">{t('editor.syntaxGuide')}</h4>
            <div className="grid gap-3 md:grid-cols-3 text-xs">
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                  {fieldsData.syntax_guide.simple_field}
                </code>
                <span className="text-gray-500">{t('editor.singleField')}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                  {fieldsData.syntax_guide.section_start}
                </code>
                <span className="text-gray-500">{t('editor.sectionStart')}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                  {fieldsData.syntax_guide.section_end}
                </code>
                <span className="text-gray-500">{t('editor.sectionEnd')}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
