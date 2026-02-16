import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { EditableList } from '@/components/EditableList'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { Code, FileText, Sparkles, Pencil, Trophy, Layers, Star, ClipboardList, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { SummaryTabProps } from './types'

export function SummaryTab({
  project,
  analysis,
  final,
  detailed,
  editStatus,
  t,
  onSaveKeyTasks,
  onResetKeyTasks,
  contributorAnalysis,
  perRepoAnalyses,
}: SummaryTabProps) {
  const [isEditingKeyTasks, setIsEditingKeyTasks] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const isMultiRepo = perRepoAnalyses && perRepoAnalyses.repo_count > 1

  const toggleExpand = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
          {/* AI Tools */}
          {project.ai_tools_detected && project.ai_tools_detected.length > 0 && (
            <div className="pt-2">
              <span className="text-gray-500 text-sm flex items-center gap-1">
                <Bot className="h-3.5 w-3.5 text-violet-500" />
                {t('detail.aiTools.title')}
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {project.ai_tools_detected.map((tool: { tool: string; count: number }) => (
                  <Badge key={tool.tool} className="bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 border border-violet-300 dark:border-violet-700 text-xs">
                    <Bot className="h-3 w-3 mr-1" />
                    {tool.tool} ({tool.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 주요 구현 내용 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            {t('detail.summary.keyImplementations')}
            {!isMultiRepo && editStatus?.key_tasks_modified && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs ml-2">
                {t('detail.badge.modified')}
              </Badge>
            )}
          </CardTitle>
          {!isMultiRepo && !isEditingKeyTasks && (
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
          {isMultiRepo ? (
            <div className="space-y-5">
              {perRepoAnalyses.analyses.map((repo) => {
                const repoName = repo.label || repo.repo_url.split('/').pop()?.replace('.git', '') || repo.repo_url
                const tasks = repo.key_tasks || []
                if (tasks.length === 0) return null
                return (
                  <div key={repo.repo_url}>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                      [{repoName}]
                      {repo.is_primary && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 gap-1">
                          <Star className="h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                    </h4>
                    <ul className="space-y-1.5 ml-1">
                      {tasks.map((task, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <span className="text-blue-500 mt-1 text-xs flex-shrink-0">&#9679;</span>
                          <InlineMarkdown>{task}</InlineMarkdown>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
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
          )}
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

      {/* 성과 - 카테고리별 그룹화 + 제목 리스트 */}
      {isMultiRepo ? (
        /* Multi-repo: per-repo achievements */
        perRepoAnalyses.analyses.some((r) => r.detailed_achievements && Object.keys(r.detailed_achievements).length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                {t('detail.summary.achievements')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {perRepoAnalyses.analyses.map((repo) => {
                const repoName = repo.label || repo.repo_url.split('/').pop()?.replace('.git', '') || repo.repo_url
                if (!repo.detailed_achievements || Object.keys(repo.detailed_achievements).length === 0) return null
                return (
                  <div key={repo.repo_url}>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                      [{repoName}]
                      {repo.is_primary && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 gap-1">
                          <Star className="h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                    </h4>
                    <div className="space-y-4 ml-1">
                      {Object.entries(repo.detailed_achievements).map(([category, items]) => (
                        items.length > 0 && (
                          <div key={category} className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border-2 border-amber-300 shadow-sm">
                            <h5 className="text-base font-bold text-amber-800 dark:text-amber-300 mb-2 pb-1.5 border-b border-amber-200 dark:border-amber-700">
                              {category}
                            </h5>
                            <ul className="space-y-2">
                              {items.map((ach, idx) => (
                                <li key={idx} className="flex items-start gap-3">
                                  <span className="text-amber-600 dark:text-amber-400 font-bold text-lg leading-6 flex-shrink-0">•</span>
                                  <span className="text-gray-900 dark:text-gray-100 leading-relaxed font-medium"><InlineMarkdown>{ach.title}</InlineMarkdown></span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      ) : (
        /* Single-repo: existing behavior */
        detailed?.detailed_achievements && Object.keys(detailed.detailed_achievements).length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                {t('detail.summary.achievements')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {Object.entries(detailed.detailed_achievements).map(([category, achievements]) => (
                achievements.length > 0 && (
                  <div key={category} className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-5 border-2 border-amber-300 shadow-sm">
                    <h4 className="text-lg font-bold text-amber-800 dark:text-amber-300 mb-3 pb-2 border-b border-amber-200 dark:border-amber-700">
                      {category}
                    </h4>
                    <ul className="space-y-2.5">
                      {achievements.map((ach: any, idx: number) => (
                        <li key={idx} className="flex items-start gap-3">
                          <span className="text-amber-600 dark:text-amber-400 font-bold text-lg leading-6 flex-shrink-0">•</span>
                          <span className="text-gray-900 dark:text-gray-100 leading-relaxed font-medium"><InlineMarkdown>{ach.title}</InlineMarkdown></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ))}
            </CardContent>
          </Card>
        ) : null
      )}

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

      {/* AI 요약 — always project-level (combined for multi-repo, single for single-repo) */}
      {(project.ai_summary || final?.ai_summary?.summary) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {t('detail.summary.aiSummary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{final?.ai_summary?.summary || project.ai_summary || ''}</ReactMarkdown>
            </div>
            {(final?.ai_summary?.key_features?.length || project.ai_key_features?.length) ? (
              <div>
                <span className="text-sm text-gray-500">{t('detail.summary.keyFeatures')}</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {(final?.ai_summary?.key_features || project.ai_key_features || []).map((feature: string, index: number) => (
                    <li key={index}><InlineMarkdown>{feature}</InlineMarkdown></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Per-Repo Summary (multi-repo projects) */}
      {perRepoAnalyses && perRepoAnalyses.repo_count > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-500" />
              {t('detail.summary.perRepoBreakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {perRepoAnalyses.analyses.map((repo) => {
              const repoName = repo.label || repo.repo_url.split('/').pop()?.replace('.git', '') || repo.repo_url
              return (
                <div
                  key={repo.repo_url}
                  className="rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">[{repoName}]</h4>
                    {repo.is_primary && (
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 gap-1">
                        <Star className="h-3 w-3" />
                        Primary
                      </Badge>
                    )}
                    {repo.primary_language && (
                      <Badge variant="outline" className="text-xs">{repo.primary_language}</Badge>
                    )}
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                      {repo.user_commits} {t('detail.basicInfo.perRepoCommits')} · +{repo.lines_added.toLocaleString()} / -{repo.lines_deleted.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Key tasks */}
                    {repo.key_tasks && repo.key_tasks.length > 0 && (() => {
                      const taskKey = `${repo.repo_url}-tasks`
                      const isExpanded = expandedSections.has(taskKey)
                      const limit = 3
                      const visibleTasks = isExpanded ? repo.key_tasks : repo.key_tasks.slice(0, limit)
                      const remaining = repo.key_tasks.length - limit
                      return (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                            <ClipboardList className="h-3.5 w-3.5" />
                            {t('detail.summary.perRepoKeyTasks')}
                          </p>
                          <ul className="text-sm space-y-1">
                            {visibleTasks.map((task, i) => (
                              <li key={i} className="text-gray-700 dark:text-gray-300 flex items-start gap-2">
                                <span className="text-blue-500 mt-1 text-xs">&#9679;</span>
                                <InlineMarkdown>{task}</InlineMarkdown>
                              </li>
                            ))}
                            {!isExpanded && remaining > 0 && (
                              <li className="text-gray-400 dark:text-gray-500 text-xs pl-4">...</li>
                            )}
                          </ul>
                          {remaining > 0 && (
                            <button
                              onClick={() => toggleExpand(taskKey)}
                              className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mt-1.5 flex items-center gap-1 transition-colors"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="h-3 w-3" />{t('detail.buttons.collapse', '접기')}</>
                              ) : (
                                <><ChevronDown className="h-3 w-3" />+{remaining} {t('detail.buttons.showMore', '더보기')}</>
                              )}
                            </button>
                          )}
                        </div>
                      )
                    })()}

                    {/* AI Summary */}
                    {repo.ai_summary && (() => {
                      const aiKey = `${repo.repo_url}-ai`
                      const isExpanded = expandedSections.has(aiKey)
                      const summaryText = repo.ai_summary
                      const truncateLen = 150
                      const needsTruncation = summaryText.length > truncateLen
                      return (
                        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                            {t('detail.summary.perRepoAiSummary')}
                          </p>
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown>{isExpanded || !needsTruncation ? summaryText : summaryText.slice(0, truncateLen) + '...'}</ReactMarkdown>
                          </div>
                          {needsTruncation && (
                            <button
                              onClick={() => toggleExpand(aiKey)}
                              className="text-xs text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 mt-1.5 flex items-center gap-1 transition-colors"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="h-3 w-3" />{t('detail.buttons.collapse', '접기')}</>
                              ) : (
                                <><ChevronDown className="h-3 w-3" />{t('detail.buttons.showMore', '더보기')}</>
                              )}
                            </button>
                          )}
                        </div>
                      )
                    })()}

                    {/* Achievements */}
                    {repo.detailed_achievements && Object.keys(repo.detailed_achievements).length > 0 && (() => {
                      const achKey = `${repo.repo_url}-ach`
                      const isExpanded = expandedSections.has(achKey)
                      const allEntries = Object.entries(repo.detailed_achievements).filter(([, items]) => items.length > 0)
                      const limit = 2
                      const hiddenCount = allEntries.reduce((sum, [, items]) => sum + Math.max(0, items.length - limit), 0)
                      return (
                        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                            <Trophy className="h-3.5 w-3.5 text-amber-500" />
                            {t('detail.summary.perRepoAchievements')}
                          </p>
                          <div className="space-y-2">
                            {allEntries.map(([category, items]) => {
                              const visibleItems = isExpanded ? items : items.slice(0, limit)
                              const hasTruncated = !isExpanded && items.length > limit
                              return (
                                <div key={category}>
                                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    {category} ({items.length})
                                  </span>
                                  <ul className="ml-3 mt-0.5 space-y-0.5">
                                    {visibleItems.map((item, i) => (
                                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400">
                                        - <InlineMarkdown>{item.title}</InlineMarkdown>
                                      </li>
                                    ))}
                                    {hasTruncated && (
                                      <li className="text-xs text-gray-400 dark:text-gray-500">...</li>
                                    )}
                                  </ul>
                                </div>
                              )
                            })}
                          </div>
                          {hiddenCount > 0 && (
                            <button
                              onClick={() => toggleExpand(achKey)}
                              className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 mt-1.5 flex items-center gap-1 transition-colors"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="h-3 w-3" />{t('detail.buttons.collapse', '접기')}</>
                              ) : (
                                <><ChevronDown className="h-3 w-3" />{t('detail.buttons.showMore', '더보기')}</>
                              )}
                            </button>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </>
  )
}
