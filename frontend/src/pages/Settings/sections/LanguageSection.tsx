import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { changeLanguage, getCurrentLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n'

export default function LanguageSection() {
  const { t } = useTranslation('settings')
  const currentLanguage = getCurrentLanguage()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('languageSection.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('languageSection.description')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border transition-all',
              currentLanguage === lang.code
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'border-input hover:border-primary/50'
            )}
          >
            <Globe className="h-5 w-5 text-muted-foreground" />
            <div className="text-left">
              <div className="font-medium">{lang.nativeName}</div>
              <div className="text-xs text-muted-foreground">{lang.name}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
