import { useTranslation } from 'react-i18next'
import { Moon, Sun, Monitor, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useThemeStore, ThemeColor, THEME_DEFINITIONS } from '@/stores/themeStore'
import { cn } from '@/lib/utils'

const themeColors: { value: ThemeColor; label: string; color: string }[] = THEME_DEFINITIONS.map((theme) => ({
  value: theme.id,
  label: theme.name,
  color: theme.id === 'default' ? 'bg-blue-500' :
         theme.id === 'ocean' ? 'bg-cyan-500' :
         theme.id === 'forest' ? 'bg-green-500' :
         theme.id === 'dusk' ? 'bg-purple-500' :
         theme.id === 'lime' ? 'bg-lime-500' :
         theme.id === 'retro' ? 'bg-orange-500' :
         'bg-pink-500'
}))

export function ThemeToggle() {
  const { t } = useTranslation()
  const { mode, color, setMode, setColor, resolvedMode } = useThemeStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          {resolvedMode === 'dark' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="sr-only">{t('settings:theme')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('settings:theme')}
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => setMode('light')}
          className={cn(mode === 'light' && 'bg-accent')}
        >
          <Sun className="h-4 w-4 mr-2" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setMode('dark')}
          className={cn(mode === 'dark' && 'bg-accent')}
        >
          <Moon className="h-4 w-4 mr-2" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setMode('system')}
          className={cn(mode === 'system' && 'bg-accent')}
        >
          <Monitor className="h-4 w-4 mr-2" />
          System
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
          <Palette className="h-3 w-3" />
          Color
        </DropdownMenuLabel>
        {themeColors.map((theme) => (
          <DropdownMenuItem
            key={theme.value}
            onClick={() => setColor(theme.value)}
            className={cn(color === theme.value && 'bg-accent')}
          >
            <span className={cn('h-3 w-3 rounded-full mr-2', theme.color)} />
            {theme.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
