import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { EditableList } from '@/components/EditableList'
import { Code, FileText, Sparkles, Pencil } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { SummaryTabProps } from './types'

export function SummaryTab({
  project,
  analysis,
  final,
  editStatus,
  t,
  onSaveKeyTasks,
  onResetKeyTasks,
  contributorAnalysis
}: SummaryTabProps) {
  const [isEditingKeyTasks, setIsEditingKeyTasks] = useState(false)

  if (!project.is_analyzed || !analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('detail.summary.noData')}</h3>
          <p className="text-gray-500 text-center">{t('detail.summary.noDataDesc')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* 프로젝트 개요 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.summary.overview')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">{t('detail.summary.periodLabel')}</span>{' '}
              <span className="font-medium">
                {final?.overview?.date_range || `${formatDate(project.start_date)} ~ ${project.end_date ? formatDate(project.end_date) : t('detail.basicInfo.ongoing')}`}
              </span>
            </div>
            <div>
              <span className="text-gray-500">{t('detail.summary.companyLabel')}</span>{' '}
              <span className="font-medium">{final?.overview?.company || t('detail.summary.freelancer')}</span>
            </div>
            <div>
              <span className="text-gray-500">{t('detail.summary.roleLabel')}</span>{' '}
              <span className="font-medium">{final?.overview?.role || project.role || t('detail.summary.developer')}</span>
            </div>
            {(project.team_size || final?.overview?.team_size) && (
              <div>
                <span className="text-gray-500">{t('detail.summary.teamSizeLabel')}</span>{' '}
                <span className="font-medium">{t('detail.summary.teamSizeValue', { count: final?.overview?.team_size || project.team_size })}</span>
              </div>
            )}
          </div>
          <div className="pt-2">
            <span className="text-gray-500 text-sm">{t('detail.summary.myTechStackLabel')}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {(contributorAnalysis?.detected_technologies || final?.technologies || project.technologies?.map((tech: any) => tech.name) || []).map((tech: string) => (
                <TechBadge key={tech} tech={tech} size="sm" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 주요 구현 내용 (인라인 편집 가능) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            {t('detail.summary.keyImplementations')}
            {editStatus?.key_tasks_modified && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs ml-2">
                {t('detail.badge.modified')}
              </Badge>
            )}
          </CardTitle>
          {!isEditingKeyTasks && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingKeyTasks(true)}
              className="h-8 text-gray-500 hover:text-gray-700"
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t('detail.buttons.editBtn')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <EditableList
            items={analysis?.key_tasks || []}
            onSave={async (items) => {
              await onSaveKeyTasks(items)
              setIsEditingKeyTasks(false)
            }}
            onReset={async () => {
              await onResetKeyTasks()
              setIsEditingKeyTasks(false)
            }}
            isModified={editStatus?.key_tasks_modified || false}
            emptyMessage={t('detail.summary.noKeyImplementations')}
            itemPrefix="•"
            isEditing={isEditingKeyTasks}
            onEditingChange={setIsEditingKeyTasks}
            hideEditButton
            translations={{
              modified: t('detail.editor.modified'),
              editBtn: t('detail.buttons.editBtn'),
              cancel: t('detail.buttons.cancel'),
              save: t('detail.buttons.save'),
              resetToOriginal: t('detail.buttons.resetToOriginal'),
              newItemPlaceholder: t('detail.editor.newItemPlaceholder'),
              addItem: t('detail.buttons.addItem'),
              noItems: t('detail.editor.noItems'),
            }}
          />
        </CardContent>
      </Card>

      {/* 기술 스택 (버전 포함) - 상세 분석에서 가져옴 */}
      {analysis?.tech_stack_versions && Object.keys(analysis.tech_stack_versions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-green-500" />
              {t('detail.summary.techStackVersions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(analysis.tech_stack_versions as Record<string, string[]>).map(([category, techs]) => (
              <div key={category}>
                <p className="font-medium text-sm text-gray-500 mb-1">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {techs.map((tech: string, idx: number) => (
                    <TechBadge key={idx} tech={tech} size="sm" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 성과 */}
      {(final?.achievements?.length || project.achievements?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.summary.achievements')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(final?.achievements || project.achievements || []).map((ach: any, index: number) => (
              <div key={index} className="border-l-4 border-amber-400 pl-4 py-2">
                <div className="font-semibold text-gray-900">[ {ach.metric_name} ]</div>
                {ach.description && <p className="text-sm text-gray-600 mt-1">{ach.description}</p>}
                {ach.metric_value && (
                  <div className="text-amber-600 font-medium mt-1">▶ {ach.metric_value}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* 코드 기여도 */}
      {(final?.code_contribution || analysis) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.summary.codeContribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="text-emerald-600 text-sm">{t('detail.summary.addedCode')}</div>
                <div className="text-xl font-bold text-emerald-700">
                  +{(final?.code_contribution?.lines_added || analysis?.lines_added || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-red-600 text-sm">{t('detail.summary.deletedCode')}</div>
                <div className="text-xl font-bold text-red-700">
                  -{(final?.code_contribution?.lines_deleted || analysis?.lines_deleted || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-blue-600 text-sm">{t('detail.summary.commits')}</div>
                <div className="text-xl font-bold text-blue-700">
                  {(final?.code_contribution?.commits || analysis?.user_commits || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-purple-600 text-sm">{t('detail.summary.contribution')}</div>
                <div className="text-xl font-bold text-purple-700">
                  {(final?.code_contribution?.contribution_percent ||
                    (analysis?.total_commits > 0 ? ((analysis?.user_commits / analysis?.total_commits) * 100).toFixed(1) : 0))}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 요약 */}
      {(project.ai_summary || final?.ai_summary?.summary) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {t('detail.summary.aiSummary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{final?.ai_summary?.summary || project.ai_summary}</p>
            {(final?.ai_summary?.key_features?.length || project.ai_key_features?.length) ? (
              <div>
                <span className="text-sm text-gray-500">{t('detail.summary.keyFeatures')}</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {(final?.ai_summary?.key_features || project.ai_key_features || []).map((feature: string, index: number) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )
}
