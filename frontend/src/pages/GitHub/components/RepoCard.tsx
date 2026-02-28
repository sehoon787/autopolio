import { useTranslation } from 'react-i18next'
import { CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SelectableTile } from '@/components/ui/selectable-tile'
import { Star, GitFork } from 'lucide-react'
import { GitHubRepo } from '@/api/github'

interface RepoCardProps {
  repo: GitHubRepo
  selected: boolean
  onToggle: () => void
}

export function RepoCard({ repo, selected, onToggle }: RepoCardProps) {
  const { t, i18n } = useTranslation('github')

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <SelectableTile
      id={repo.clone_url}
      selected={selected}
      onSelectChange={onToggle}
    >
      <CardContent className="py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{repo.name}</h3>
            {repo.language && (
              <Badge variant="outline" className="text-xs">
                {repo.language}
              </Badge>
            )}
          </div>

          {repo.description && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {repo.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {repo.stargazers_count}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="h-3 w-3" />
              {repo.forks_count}
            </span>
            <span>
              {t('updated')} {formatDate(repo.updated_at)}
            </span>
          </div>
        </div>
      </CardContent>
    </SelectableTile>
  )
}
