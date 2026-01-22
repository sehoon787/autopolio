import { useTranslation } from 'react-i18next'
import { Github, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { useUserStore } from '@/stores/userStore'

export default function GitHubSection() {
  const { t } = useTranslation('settings')
  const { user } = useUserStore()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('github.title')}</h2>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        {user?.github_username ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user.github_avatar_url ? (
                <img
                  src={user.github_avatar_url}
                  alt={user.github_username}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Github className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  {user.github_username}
                </p>
                <p className="text-xs text-green-600">
                  {t('github.connected')}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/setup/github">
                {t('github.reconnect')}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('github.notConnected')}
            </p>
            <Button asChild>
              <Link to="/setup/github">
                <Github className="mr-2 h-4 w-4" />
                {t('github.connect')}
              </Link>
            </Button>
          </div>
        )}

        <div className="pt-4 border-t">
          <p className="text-sm font-medium mb-2">
            {t('github.features.title')}
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• {t('github.features.repoList')}</li>
            <li>• {t('github.features.commitAnalysis')}</li>
            <li>• {t('github.features.techDetection')}</li>
            <li>• {t('github.features.contributionStats')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
