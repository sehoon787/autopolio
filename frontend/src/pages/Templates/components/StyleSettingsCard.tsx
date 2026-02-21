import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Type, RotateCcw } from 'lucide-react'

export interface StyleSettings {
  font_name: string
  title_size: number
  heading1_size: number
  heading2_size: number
  heading3_size: number
  normal_size: number
}

interface StyleSettingsCardProps {
  styleSettings: StyleSettings
  onUpdateStyleSetting: (key: keyof StyleSettings, value: string | number) => void
  onResetStyles: () => void
}

export function StyleSettingsCard({ styleSettings, onUpdateStyleSetting, onResetStyles }: StyleSettingsCardProps) {
  const { t } = useTranslation('templates')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Type className="h-5 w-5 text-primary" />
            <CardTitle>{t('styleSettings.title')}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onResetStyles}>
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('styleSettings.reset')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('styleSettings.description')}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Font Name */}
          <div className="space-y-2">
            <Label htmlFor="font-name">{t('styleSettings.fontName')}</Label>
            <Input
              id="font-name"
              value={styleSettings.font_name}
              onChange={(e) => onUpdateStyleSetting('font_name', e.target.value)}
              placeholder={t('styleSettings.fontNamePlaceholder')}
            />
          </div>

          {/* Title Size */}
          <div className="space-y-2">
            <Label htmlFor="title-size">
              {t('styleSettings.titleSize')}
              <span className="ml-2 text-xs text-muted-foreground">
                ({styleSettings.title_size}{t('styleSettings.pt')})
              </span>
            </Label>
            <Input
              id="title-size"
              type="number"
              min={10}
              max={48}
              value={styleSettings.title_size}
              onChange={(e) => onUpdateStyleSetting('title_size', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('styleSettings.titleSizeDesc')}</p>
          </div>

          {/* Heading 1 Size */}
          <div className="space-y-2">
            <Label htmlFor="heading1-size">
              {t('styleSettings.heading1Size')}
              <span className="ml-2 text-xs text-muted-foreground">
                ({styleSettings.heading1_size}{t('styleSettings.pt')})
              </span>
            </Label>
            <Input
              id="heading1-size"
              type="number"
              min={10}
              max={36}
              value={styleSettings.heading1_size}
              onChange={(e) => onUpdateStyleSetting('heading1_size', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('styleSettings.heading1SizeDesc')}</p>
          </div>

          {/* Heading 2 Size */}
          <div className="space-y-2">
            <Label htmlFor="heading2-size">
              {t('styleSettings.heading2Size')}
              <span className="ml-2 text-xs text-muted-foreground">
                ({styleSettings.heading2_size}{t('styleSettings.pt')})
              </span>
            </Label>
            <Input
              id="heading2-size"
              type="number"
              min={10}
              max={24}
              value={styleSettings.heading2_size}
              onChange={(e) => onUpdateStyleSetting('heading2_size', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('styleSettings.heading2SizeDesc')}</p>
          </div>

          {/* Heading 3 Size */}
          <div className="space-y-2">
            <Label htmlFor="heading3-size">
              {t('styleSettings.heading3Size')}
              <span className="ml-2 text-xs text-muted-foreground">
                ({styleSettings.heading3_size}{t('styleSettings.pt')})
              </span>
            </Label>
            <Input
              id="heading3-size"
              type="number"
              min={10}
              max={18}
              value={styleSettings.heading3_size}
              onChange={(e) => onUpdateStyleSetting('heading3_size', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('styleSettings.heading3SizeDesc')}</p>
          </div>

          {/* Normal Text Size */}
          <div className="space-y-2">
            <Label htmlFor="normal-size">
              {t('styleSettings.normalSize')}
              <span className="ml-2 text-xs text-muted-foreground">
                ({styleSettings.normal_size}{t('styleSettings.pt')})
              </span>
            </Label>
            <Input
              id="normal-size"
              type="number"
              min={8}
              max={14}
              value={styleSettings.normal_size}
              onChange={(e) => onUpdateStyleSetting('normal_size', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('styleSettings.normalSizeDesc')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
