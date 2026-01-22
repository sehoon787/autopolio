import { useThemeStore } from '@/stores/themeStore'

interface LogoProps {
  size?: number
  className?: string
}

export function Logo({ size = 32, className = '' }: LogoProps) {
  const { resolvedMode } = useThemeStore()

  const iconSrc = resolvedMode === 'dark' ? '/icon-dark.png' : '/icon-light.png'

  return (
    <img
      src={iconSrc}
      alt="Autopolio"
      width={size}
      height={size}
      className={className}
    />
  )
}
