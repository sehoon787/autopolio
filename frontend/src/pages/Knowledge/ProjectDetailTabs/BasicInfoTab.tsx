import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { EditableList } from '@/components/EditableList'
import {
  Github,
  ExternalLink,
  Trophy,
  Code,
  GitCommit,
  ClipboardList,
  Pencil,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { BasicInfoTabProps } from './types'

export function BasicInfoTab({
  project,
  analysis,
  editStatus,
  t,
  onSaveKeyTasks,
  onResetKeyTasks
}: BasicInfoTabProps) {
  const [isEditingKeyTasks, setIsEditingKeyTasks] = useState(false)

  return (
    <>
      {/* 프로젝트 정보 & 기술 스택 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {t('detail.basicInfo.projectInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm text-gray-500">{t('detail.basicInfo.period')}</span>
              <p>
                {formatDate(project.start_date)} ~ {project.end_date ? formatDate(project.end_date) : t('detail.basicInfo.ongoing')}
              </p>
            </div>
            {project.role && (
              <div>
                <span className="text-sm text-gray-500">{t('detail.basicInfo.role')}</span>
                <p>{project.role}</p>
              </div>
            )}
            {project.team_size && (
              <div>
                <span className="text-sm text-gray-500">{t('detail.basicInfo.teamSize')}</span>
                <p>{t('detail.basicInfo.teamSizeValue', { count: project.team_size })}</p>
              </div>
            )}
            {project.git_url && (
              <div>
                <span className="text-sm text-gray-500">GitHub</span>
                <a
                  href={project.git_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  <Github className="h-4 w-4" />
                  {project.git_url.replace('https://github.com/', '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('detail.basicInfo.techStack')}</CardTitle>
          </CardHeader>
          <CardContent>
            {project.technologies?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {project.technologies.map((tech: any) => (
                  <TechBadge key={tech.id} tech={tech.name} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500">{t('detail.basicInfo.noTechStack')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 주요 수행 업무 (인라인 편집 가능) */}
      {project.is_analyzed && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              {t('detail.basicInfo.keyTasks')}
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
              emptyMessage={t('detail.basicInfo.noKeyTasks')}
              itemPrefix="(n)"
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
      )}

      {/* 성과 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {t('detail.basicInfo.achievements')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.achievements?.length > 0 ? (
            <div className="space-y-4">
              {project.achievements.map((achievement: any) => (
                <div key={achievement.id} className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-100">
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 rounded-full p-2 mt-0.5">
                      <Trophy className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{achievement.metric_name}</h4>
                      {achievement.description && (
                        <p className="text-gray-600 mt-1 text-sm">{achievement.description}</p>
                      )}
                      {achievement.metric_value && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-amber-600 font-medium">▶</span>
                          <span className="text-lg font-bold text-amber-700">{achievement.metric_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Trophy className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>{t('detail.basicInfo.noAchievements')}</p>
              <p className="text-sm mt-1">{t('detail.basicInfo.analyzeForAchievements')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 커밋/코드 통계 */}
      {project.is_analyzed && analysis && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCommit className="h-5 w-5" />
                {t('detail.basicInfo.commitStats')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-3">
                  <span className="text-sm text-blue-600">{t('detail.basicInfo.totalCommits')}</span>
                  <p className="text-2xl font-bold text-blue-700">{analysis.total_commits}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <span className="text-sm text-green-600">{t('detail.basicInfo.myCommits')}</span>
                  <p className="text-2xl font-bold text-green-700">{analysis.user_commits}</p>
                </div>
              </div>
              {analysis.total_commits > 0 && analysis.user_commits > 0 && (
                <div className="text-sm text-gray-600">
                  {t('detail.basicInfo.contribution')}: <span className="font-semibold">{((analysis.user_commits / analysis.total_commits) * 100).toFixed(1)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {t('detail.basicInfo.codeStats')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-emerald-600">{t('detail.basicInfo.added')}</span>
                  <p className="text-lg font-bold text-emerald-700">+{analysis.lines_added?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-red-600">{t('detail.basicInfo.deleted')}</span>
                  <p className="text-lg font-bold text-red-700">-{analysis.lines_deleted?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <span className="text-xs text-purple-600">{t('detail.basicInfo.files')}</span>
                  <p className="text-lg font-bold text-purple-700">{analysis.files_changed?.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Not Analyzed State */}
      {!project.is_analyzed && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Code className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('detail.basicInfo.notAnalyzed')}</h3>
            <p className="text-gray-500 mb-4 text-center">
              {project.git_url
                ? t('detail.basicInfo.notAnalyzedDescWithUrl')
                : t('detail.basicInfo.notAnalyzedDescWithoutUrl')}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
