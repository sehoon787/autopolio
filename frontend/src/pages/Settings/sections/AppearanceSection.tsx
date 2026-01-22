import { useTranslation } from 'react-i18next'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, THEME_DEFINITIONS, ThemeMode, ThemeColor } from '@/stores/themeStore'

const modeOptions: { value: ThemeMode; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', labelKey: 'appearance.light', icon: Sun },
  { value: 'dark', labelKey: 'appearance.dark', icon: Moon },
  { value: 'system', labelKey: 'appearance.system', icon: Monitor },
]

export default function AppearanceSection() {
  const { t } = useTranslation('settings')
  const { mode, color, resolvedMode, setMode, setColor } = useThemeStore()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('appearance.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('appearance.description')}</p>
      </div>

      {/* Mode Selection */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{t('appearance.mode')}</h3>
          <p className="text-sm text-muted-foreground">{t('appearance.modeDescription')}</p>
        </div>
        <div className="flex gap-2">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md border transition-colors',
                mode === option.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-input hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <option.icon className="h-4 w-4" />
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Color Theme Selection */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{t('appearance.colorTheme')}</h3>
          <p className="text-sm text-muted-foreground">{t('appearance.colorThemeDescription')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEME_DEFINITIONS.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setColor(theme.id as ThemeColor)}
              className={cn(
                'relative flex items-center gap-3 p-4 rounded-lg border transition-all',
                color === theme.id
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-input hover:border-primary/50'
              )}
            >
              {/* Color preview circles */}
              <div className="flex -space-x-1">
                <div
                  className="w-6 h-6 rounded-full border-2 border-background shadow-sm"
                  style={{ backgroundColor: resolvedMode === 'dark' ? theme.dark : theme.light }}
                />
                <div
                  className="w-6 h-6 rounded-full border-2 border-background shadow-sm"
                  style={{ backgroundColor: theme.accent }}
                />
              </div>

              {/* Theme info */}
              <div className="flex-1 text-left">
                <div className="font-medium text-sm">{theme.name}</div>
                <div className="text-xs text-muted-foreground">{theme.desc}</div>
              </div>

              {/* Check mark */}
              {color === theme.id && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
