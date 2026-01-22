import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { useNotificationStore } from '@/stores/notificationStore'

interface NotificationItemProps {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function NotificationItem({ title, description, checked, onCheckedChange }: NotificationItemProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-0">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function NotificationsSection() {
  const { t } = useTranslation('settings')
  const {
    onTaskComplete,
    onTaskFailed,
    onReviewNeeded,
    soundEnabled,
    setOnTaskComplete,
    setOnTaskFailed,
    setOnReviewNeeded,
    setSoundEnabled,
  } = useNotificationStore()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('notifications.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('notifications.description')}</p>
      </div>

      <div className="rounded-lg border">
        <div className="px-4">
          <NotificationItem
            title={t('notifications.taskComplete')}
            description={t('notifications.taskCompleteDescription')}
            checked={onTaskComplete}
            onCheckedChange={setOnTaskComplete}
          />
          <NotificationItem
            title={t('notifications.taskFailed')}
            description={t('notifications.taskFailedDescription')}
            checked={onTaskFailed}
            onCheckedChange={setOnTaskFailed}
          />
          <NotificationItem
            title={t('notifications.reviewNeeded')}
            description={t('notifications.reviewNeededDescription')}
            checked={onReviewNeeded}
            onCheckedChange={setOnReviewNeeded}
          />
          <NotificationItem
            title={t('notifications.sound')}
            description={t('notifications.soundDescription')}
            checked={soundEnabled}
            onCheckedChange={setSoundEnabled}
          />
        </div>
      </div>
    </div>
  )
}
