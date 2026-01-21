import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/stores/userStore'
import { changeLanguage, getCurrentLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n'
import { Github, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SettingsPage() {
  const { t } = useTranslation(['settings', 'common'])
  const { user } = useUserStore()
  const currentLanguage = getCurrentLanguage()

  const handleLanguageChange = (value: string) => {
    changeLanguage(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('settings:title')}</h1>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:general')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:language')}</Label>
              </div>
              <Select value={currentLanguage} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.nativeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* GitHub Integration */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:github.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <Github className="h-5 w-5 text-gray-500" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      {user.github_username}
                    </p>
                    <p className="text-xs text-green-600">
                      {t('settings:github.connected')}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/setup/github">
                    {t('settings:github.reconnect')}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('settings:github.notConnected')}
                </p>
                <Button asChild>
                  <Link to="/setup/github">
                    <Github className="mr-2 h-4 w-4" />
                    {t('settings:github.connect')}
                  </Link>
                </Button>
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">
                {t('settings:github.features.title')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t('settings:github.features.repoList')}</li>
                <li>• {t('settings:github.features.commitAnalysis')}</li>
                <li>• {t('settings:github.features.techDetection')}</li>
                <li>• {t('settings:github.features.contributionStats')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        {user && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:user.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <Label>{t('settings:user.name')}</Label>
                  <span className="text-sm">{user.name}</span>
                </div>
                {user.email && (
                  <div className="flex items-center justify-between">
                    <Label>{t('settings:user.email')}</Label>
                    <span className="text-sm">{user.email}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
