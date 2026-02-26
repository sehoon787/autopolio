import { Badge } from '@/components/ui/badge'
import { TechBadge } from '@/components/ui/tech-badge'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Code,
  GitCommit,
  Trophy,
  Layers,
  Star,
  ClipboardList,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useExpandableSection } from '@/hooks/useExpandableSection'
import { getRepoDisplayName } from '@/lib/repo-utils'
import type { MultiRepoAnalysisResponse } from '@/api/github'

interface PerRepoDetailBreakdownProps {
  perRepoAnalyses: MultiRepoAnalysisResponse
  t: (key: string, options?: any) => string
}

export function PerRepoDetailBreakdown({ perRepoAnalyses, t }: PerRepoDetailBreakdownProps) {
  const { expandedSections, toggleExpand } = useExpandableSection()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-indigo-500" />
          {t('detail.detailTab.perRepoBreakdown')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {perRepoAnalyses.analyses.map((repo) => {
          const repoName = getRepoDisplayName(repo)
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
                {/* Technologies */}
                {repo.detected_technologies.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                      <Code className="h-3.5 w-3.5 text-green-500" />
                      {t('detail.detailTab.perRepoTechStack')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {repo.detected_technologies.slice(0, 10).map((tech) => (
                        <TechBadge key={tech} tech={tech} size="sm" />
                      ))}
                      {repo.detected_technologies.length > 10 && (
                        <Badge variant="outline" className="text-xs">
                          +{repo.detected_technologies.length - 10}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Key tasks */}
                {repo.key_tasks && repo.key_tasks.length > 0 && (() => {
                  const taskKey = `${repo.repo_url}-tasks`
                  const isTaskExpanded = expandedSections.has(taskKey)
                  const taskLimit = 3
                  const visibleTasks = isTaskExpanded ? repo.key_tasks : repo.key_tasks.slice(0, taskLimit)
                  const taskRemaining = repo.key_tasks.length - taskLimit
                  return (
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {t('detail.detailTab.perRepoKeyFeatures')}
                      </p>
                      <ul className="text-sm space-y-1">
                        {visibleTasks.map((task, i) => (
                          <li key={i} className="text-gray-700 dark:text-gray-300 flex items-start gap-2">
                            <span className="text-blue-500 mt-1 text-xs">&#9679;</span>
                            <InlineMarkdown>{task}</InlineMarkdown>
                          </li>
                        ))}
                        {!isTaskExpanded && taskRemaining > 0 && (
                          <li className="text-gray-400 dark:text-gray-500 text-xs pl-4">...</li>
                        )}
                      </ul>
                      {taskRemaining > 0 && (
                        <button
                          onClick={() => toggleExpand(taskKey)}
                          className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mt-1.5 flex items-center gap-1 transition-colors"
                        >
                          {isTaskExpanded ? (
                            <><ChevronUp className="h-3 w-3" />{t('detail.buttons.collapse', 'Collapse')}</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" />+{taskRemaining} {t('detail.buttons.showMore', 'Show more')}</>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })()}

                {/* Detailed achievements */}
                {repo.detailed_achievements && Object.keys(repo.detailed_achievements).length > 0 && (() => {
                  const achKey = `${repo.repo_url}-ach`
                  const isAchExpanded = expandedSections.has(achKey)
                  const achLimit = 2
                  const allEntries = Object.entries(repo.detailed_achievements).filter(([, items]) => items.length > 0)
                  const hiddenCount = allEntries.reduce((sum, [, items]) => sum + Math.max(0, items.length - achLimit), 0)
                  return (
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                        {t('detail.detailTab.perRepoAchievements')}
                      </p>
                      <div className="space-y-3">
                        {allEntries.map(([category, items]) => {
                          const visibleItems = isAchExpanded ? items : items.slice(0, achLimit)
                          const hasTruncated = !isAchExpanded && items.length > achLimit
                          return (
                            items.length > 0 && (
                              <div key={category}>
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{category}</span>
                                <div className="space-y-1.5 ml-3 mt-1">
                                  {visibleItems.map((item, i) => (
                                    <div key={i} className="border-l-2 border-amber-300 pl-3">
                                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><InlineMarkdown>{item.title}</InlineMarkdown></p>
                                      {item.description && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400"><InlineMarkdown>{item.description}</InlineMarkdown></p>
                                      )}
                                    </div>
                                  ))}
                                  {hasTruncated && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 pl-3">...</p>
                                  )}
                                </div>
                              </div>
                            )
                          )
                        })}
                      </div>
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => toggleExpand(achKey)}
                          className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 mt-1.5 flex items-center gap-1 transition-colors"
                        >
                          {isAchExpanded ? (
                            <><ChevronUp className="h-3 w-3" />{t('detail.buttons.collapse', 'Collapse')}</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" />{t('detail.buttons.showMore', 'Show more')}</>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })()}

                {/* Languages */}
                {repo.languages && Object.keys(repo.languages).length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 text-blue-500" />
                      {t('detail.detailTab.perRepoLanguages')}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(repo.languages)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([lang, percent]) => (
                          <span key={lang} className="text-gray-700 dark:text-gray-300">
                            {lang} <span className="font-bold">{percent.toFixed(1)}%</span>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Commit categories */}
                {repo.commit_categories && Object.keys(repo.commit_categories).length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                      <GitCommit className="h-3.5 w-3.5" />
                      {t('detail.detailTab.perRepoCommitTypes')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(repo.commit_categories)
                        .filter(([, count]) => count > 0)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 6)
                        .map(([type, count]) => (
                          <Badge key={type} variant="outline" className="text-xs gap-1">
                            {type} <span className="font-bold">{count}</span>
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
