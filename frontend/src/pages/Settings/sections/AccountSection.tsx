import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { useUserStore } from '@/stores/userStore'

export default function AccountSection() {
  const { t } = useTranslation('settings')
  const { user } = useUserStore()

  if (!user) {
    return null
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('user.title')}</h2>
      </div>

      <div className="rounded-lg border p-4">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label>{t('user.name')}</Label>
            <span className="text-sm">{user.name}</span>
          </div>
          {user.email && (
            <div className="flex items-center justify-between">
              <Label>{t('user.email')}</Label>
              <span className="text-sm">{user.email}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
