import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'

const presets = [
  { label: '100%', value: 100 },
  { label: '125%', value: 125 },
  { label: '150%', value: 150 },
]

export default function DisplaySection() {
  const { t } = useTranslation('settings')
  const { uiScale, setUIScale } = useThemeStore()
  const [localScale, setLocalScale] = useState(uiScale)

  const handlePresetClick = (value: number) => {
    setLocalScale(value)
    setUIScale(value)
  }

  const handleSliderChange = (values: number[]) => {
    setLocalScale(values[0])
  }

  const handleApply = () => {
    setUIScale(localScale)
  }

  const handleReset = () => {
    setLocalScale(100)
    setUIScale(100)
  }

  const hasChanges = localScale !== uiScale

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('display.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('display.description')}</p>
      </div>

      {/* UI Scale */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{t('display.uiScale')}</h3>
          <p className="text-sm text-muted-foreground">{t('display.uiScaleDescription')}</p>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{t('display.presets')}</label>
          <div className="flex gap-2">
            {presets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={cn(
                  'px-4 py-2 rounded-md border transition-colors min-w-[70px]',
                  localScale === preset.value
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-input hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fine adjustment slider */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{t('display.fineAdjustment')}</label>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-10">75%</span>
            <Slider
              value={[localScale]}
              onValueChange={handleSliderChange}
              min={75}
              max={200}
              step={5}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-10">200%</span>
          </div>
          <div className="text-center text-sm font-medium">{localScale}%</div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleApply}
            disabled={!hasChanges}
          >
            {t('display.apply')}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={localScale === 100 && uiScale === 100}
          >
            {t('display.reset')}
          </Button>
        </div>
      </div>
    </div>
  )
}
