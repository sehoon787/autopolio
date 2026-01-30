import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { EditableStructuredList } from '@/components/EditableStructuredList'
import {
  Code,
  GitCommit,
  BarChart3,
  Sparkles,
  Trophy,
  Pencil,
  ExternalLink,
} from 'lucide-react'
import type { DetailTabProps } from './types'

export function DetailTab({
  project,
  analysis,
  detailed,
  editStatus,
  onSaveImplementationDetails,
  onResetImplementationDetails,
  t,
}: DetailTabProps) {
  const [isEditingImplementationDetails, setIsEditingImplementationDetails] = useState(false)

  if (!project.is_analyzed || !analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('detail.detailTab.noData')}</h3>
          <p className="text-gray-500 text-center">{t('detail.detailTab.noDataDesc')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* 주요 구현 기능 (인라인 편집 가능) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {t('detail.detailTab.keyFeatures')}
            {editStatus?.implementation_details_modified && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs ml-2">
                {t('detail.badge.modified')}
              </Badge>
            )}
          </CardTitle>
          {!isEditingImplementationDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingImplementationDetails(true)}
              className="h-8 text-gray-500 hover:text-gray-700"
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t('detail.buttons.editBtn')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <EditableStructuredList
            sections={analysis?.implementation_details || []}
            onSave={async (sections) => {
              await onSaveImplementationDetails(sections)
              setIsEditingImplementationDetails(false)
            }}
            onReset={async () => {
              await onResetImplementationDetails()
              setIsEditingImplementationDetails(false)
            }}
            isModified={editStatus?.implementation_details_modified || false}
            emptyMessage={t('detail.detailTab.noKeyFeatures')}
            isEditing={isEditingImplementationDetails}
            onEditingChange={setIsEditingImplementationDetails}
            hideEditButton
            translations={{
              modified: t('detail.editor.modified'),
              editBtn: t('detail.buttons.editBtn'),
              cancel: t('detail.buttons.cancel'),
              save: t('detail.buttons.save'),
              resetToOriginal: t('detail.buttons.resetToOriginal'),
              sectionTitlePlaceholder: t('detail.editor.sectionTitlePlaceholder'),
              itemPlaceholder: t('detail.editor.itemPlaceholder'),
              addItemBtn: t('detail.editor.addItemBtn'),
              addSection: t('detail.buttons.addSection'),
              noItems: t('detail.editor.noItems'),
            }}
          />
        </CardContent>
      </Card>

      {/* 개발 타임라인 (LLM-generated) */}
      {detailed?.development_timeline && detailed.development_timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-blue-500" />
              {t('detail.detailTab.devTimeline')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailed.development_timeline.map((phase, idx) => (
              <div key={idx} className="border-l-2 border-blue-400 pl-4 pb-4 last:pb-0">
                <p className="font-semibold text-blue-600 text-sm">{phase.period}</p>
                <p className="font-medium text-gray-900 mt-1">{phase.title}</p>
                <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                  {phase.activities.map((activity, actIdx) => (
                    <li key={actIdx}>{activity}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 기술 스택 (버전 포함) */}
      {detailed?.tech_stack_versions && Object.keys(detailed.tech_stack_versions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-green-500" />
              {t('detail.detailTab.techStackVersions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(detailed.tech_stack_versions).map(([category, techs]) => (
              <div key={category}>
                <p className="font-medium text-sm text-gray-500 mb-2">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {techs.map((tech, idx) => (
                    <TechBadge key={idx} tech={tech} size="sm" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 상세 성과 (카테고리별, LLM-generated) */}
      {detailed?.detailed_achievements && Object.keys(detailed.detailed_achievements).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              {t('detail.detailTab.achievementsByCategory')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(detailed.detailed_achievements).map(([category, achievements]) => (
              achievements.length > 0 && (
                <div key={category}>
                  <h4 className="font-semibold text-primary mb-2">{category}</h4>
                  <div className="space-y-2 ml-4">
                    {achievements.map((ach, idx) => (
                      <div key={idx} className="border-l-2 border-amber-300 pl-3">
                        <p className="font-medium text-gray-900">{ach.title}</p>
                        <p className="text-sm text-gray-600">{ach.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </CardContent>
        </Card>
      )}

      {/* 저장소 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.detailTab.repoInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.repository')}</span>
            <span className="font-medium">{detailed?.repository?.name || project.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.github')}</span>
            <a href={project.git_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              {project.git_url?.replace('https://github.com/', '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.totalCommits')}</span>
            <span className="font-medium">{t('detail.detailTab.countCommits', { count: detailed?.repository?.total_commits || analysis.total_commits })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('detail.detailTab.codeChanges')}</span>
            <span className="font-medium">
              <span className="text-emerald-600">+{(detailed?.repository?.lines_added || analysis.lines_added || 0).toLocaleString()}</span>
              {' / '}
              <span className="text-red-600">-{(detailed?.repository?.lines_deleted || analysis.lines_deleted || 0).toLocaleString()}</span>
            </span>
          </div>
          {detailed?.repository?.analyzed_at && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('detail.detailTab.analysisTime')}</span>
              <span className="font-medium">{detailed.repository.analyzed_at}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 커밋 상세 분석 & 코드 상세 분석 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="h-5 w-5" />
              {t('detail.detailTab.commitAnalysis')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.totalCommitsLabel')}</span>
                <span className="font-medium">{detailed?.commit_analysis?.total_commits || analysis.total_commits}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.myCommitsLabel')}</span>
                <span className="font-medium">
                  {detailed?.commit_analysis?.user_commits || analysis.user_commits} ({detailed?.commit_analysis?.contribution_percent || ((analysis.user_commits / analysis.total_commits) * 100).toFixed(1)}%)
                </span>
              </div>
              {analysis.commit_categories && Object.keys(analysis.commit_categories).length > 0 && (
                <>
                  {Object.entries(analysis.commit_categories).map(([category, count]) => (
                    <div key={category} className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">{category}</span>
                      <span className="font-medium">{count as number}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              {t('detail.detailTab.codeAnalysis')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.addedLines')}</span>
                <span className="font-medium text-emerald-600">+{(detailed?.code_analysis?.lines_added || analysis.lines_added || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.deletedLines')}</span>
                <span className="font-medium text-red-600">-{(detailed?.code_analysis?.lines_deleted || analysis.lines_deleted || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.netChange')}</span>
                <span className="font-medium text-blue-600">
                  {((detailed?.code_analysis?.net_change || (analysis.lines_added || 0) - (analysis.lines_deleted || 0)) > 0 ? '+' : '')}
                  {(detailed?.code_analysis?.net_change || (analysis.lines_added || 0) - (analysis.lines_deleted || 0)).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">{t('detail.detailTab.changedFiles')}</span>
                <span className="font-medium">{detailed?.code_analysis?.files_changed || analysis.files_changed || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 언어 분석 */}
      {analysis.languages && Object.keys(analysis.languages).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.detailTab.languageAnalysis')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(detailed?.languages || Object.entries(analysis.languages)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 6)
                .map(([lang, percent]) => ({ name: lang, percent: percent as number })))
                .map((lang: any) => (
                  <div key={lang.name} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium">{lang.name}</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-full h-2.5"
                        style={{ width: `${lang.percent}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-14 text-right font-medium">
                      {lang.percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 아키텍처 패턴 */}
      {(detailed?.architecture_patterns?.length || analysis.architecture_patterns?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.detailTab.architecturePatterns')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(detailed?.architecture_patterns || analysis.architecture_patterns || []).map((pattern: string) => (
                <Badge key={pattern} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {pattern}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 커밋 메시지 요약 */}
      {(detailed?.commit_analysis?.messages_summary || analysis.commit_messages_summary) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.detailTab.commitMessagesSummary')}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border">
              {detailed?.commit_analysis?.messages_summary || analysis.commit_messages_summary}
            </pre>
          </CardContent>
        </Card>
      )}
    </>
  )
}
