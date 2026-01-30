import * as React from "react"
import { cn } from "@/lib/utils"
import * as simpleIcons from "simple-icons"
import { CUSTOM_ICONS, TECH_TO_ICON, TECH_COLORS } from "@/data/tech-categories"

// Get icon and color for a technology
function getTechInfo(tech: string): { icon: string | null; color: string; slug: string | null } {
  // Find the slug for this tech
  const normalizedTech = tech.toLowerCase().replace(/[.\-_\s]/g, '')
  let slug: string | null = null

  // Try exact match first
  if (TECH_TO_ICON[tech]) {
    slug = TECH_TO_ICON[tech]
  } else {
    // Try case-insensitive match
    for (const [key, value] of Object.entries(TECH_TO_ICON)) {
      if (key.toLowerCase() === tech.toLowerCase()) {
        slug = value
        break
      }
    }

    // Try normalized match
    if (!slug) {
      for (const [key, value] of Object.entries(TECH_TO_ICON)) {
        const normalizedKey = key.toLowerCase().replace(/[.\-_\s]/g, '')
        if (normalizedKey === normalizedTech) {
          slug = value
          break
        }
      }
    }
  }

  // Check for custom icons first (for icons that don't look good from simple-icons)
  const customIconKey = normalizedTech
  if (CUSTOM_ICONS[customIconKey]) {
    return {
      icon: CUSTOM_ICONS[customIconKey].svg,
      color: CUSTOM_ICONS[customIconKey].color,
      slug: customIconKey
    }
  }

  // Also check slug for custom icons
  if (slug && CUSTOM_ICONS[slug]) {
    return {
      icon: CUSTOM_ICONS[slug].svg,
      color: CUSTOM_ICONS[slug].color,
      slug
    }
  }

  // Try to get icon from simple-icons
  if (slug) {
    const iconKey = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}` as keyof typeof simpleIcons
    const iconData = simpleIcons[iconKey]
    if (iconData && 'hex' in iconData) {
      return {
        icon: iconData.svg,
        color: `#${iconData.hex}`,
        slug
      }
    }
  }

  // Try direct lookup by tech name
  const directSlug = tech.toLowerCase().replace(/[.\-_\s]/g, '')
  const directIconKey = `si${directSlug.charAt(0).toUpperCase()}${directSlug.slice(1)}` as keyof typeof simpleIcons
  const directIconData = simpleIcons[directIconKey]
  if (directIconData && 'hex' in directIconData) {
    return {
      icon: directIconData.svg,
      color: `#${directIconData.hex}`,
      slug: directSlug
    }
  }

  // Fallback: generate color from string
  return {
    icon: null,
    color: stringToColor(tech),
    slug: null
  }
}

// Generate a consistent color from a string (for technologies not in the map)
function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  const saturation = 60 + (Math.abs(hash >> 8) % 20)
  const lightness = 45 + (Math.abs(hash >> 16) % 15)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

// Calculate contrasting text color
function getContrastColor(hexColor: string): string {
  // Handle HSL colors
  if (hexColor.startsWith('hsl')) {
    const match = hexColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
    if (match) {
      const l = parseInt(match[3])
      return l > 55 ? '#000000' : '#ffffff'
    }
    return '#ffffff'
  }

  // Handle hex colors
  let color = hexColor.replace('#', '')
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('')
  }
  const r = parseInt(color.substr(0, 2), 16)
  const g = parseInt(color.substr(2, 2), 16)
  const b = parseInt(color.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export interface TechBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  tech: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'flat' | 'flat-square' | 'plastic'
  showIcon?: boolean
}

function TechBadge({
  tech,
  size = 'md',
  variant = 'flat',
  showIcon = true,
  className,
  ...props
}: TechBadgeProps) {
  const { icon, color } = getTechInfo(tech)
  const textColor = getContrastColor(color)

  const sizeConfig = {
    sm: {
      height: 18,
      fontSize: 10,
      iconSize: 10,
      paddingX: 6,
      gap: 4,
      borderRadius: variant === 'flat-square' ? 0 : 3,
    },
    md: {
      height: 20,
      fontSize: 11,
      iconSize: 12,
      paddingX: 8,
      gap: 5,
      borderRadius: variant === 'flat-square' ? 0 : 3,
    },
    lg: {
      height: 24,
      fontSize: 12,
      iconSize: 14,
      paddingX: 10,
      gap: 6,
      borderRadius: variant === 'flat-square' ? 0 : 4,
    },
  }

  const config = sizeConfig[size]

  // Shields.io style - gradient for plastic, flat for others
  const getBackgroundStyle = (): React.CSSProperties => {
    if (variant === 'plastic') {
      return {
        background: `linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.1) 100%), ${color}`,
      }
    }
    return {
      backgroundColor: color,
    }
  }

  // Create icon SVG with proper color
  const renderIcon = () => {
    if (!showIcon || !icon) return null

    // Parse and modify SVG to set fill color and dimensions
    let modifiedSvg = icon

    // Add or replace width attribute
    if (modifiedSvg.includes('width="')) {
      modifiedSvg = modifiedSvg.replace(/width="[^"]*"/, `width="${config.iconSize}"`)
    } else {
      modifiedSvg = modifiedSvg.replace(/<svg/, `<svg width="${config.iconSize}"`)
    }

    // Add or replace height attribute
    if (modifiedSvg.includes('height="')) {
      modifiedSvg = modifiedSvg.replace(/height="[^"]*"/, `height="${config.iconSize}"`)
    } else {
      modifiedSvg = modifiedSvg.replace(/<svg/, `<svg height="${config.iconSize}"`)
    }

    // Add fill color
    modifiedSvg = modifiedSvg.replace(/<svg/, `<svg fill="${textColor}"`)

    return (
      <span
        dangerouslySetInnerHTML={{ __html: modifiedSvg }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: config.iconSize,
          height: config.iconSize,
        }}
      />
    )
  }

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: config.height,
    paddingLeft: config.paddingX,
    paddingRight: config.paddingX,
    gap: config.gap,
    fontSize: config.fontSize,
    fontWeight: 600,
    fontFamily: 'Verdana, Geneva, DejaVu Sans, sans-serif',
    color: textColor,
    borderRadius: config.borderRadius,
    whiteSpace: 'nowrap',
    textShadow: variant === 'plastic'
      ? `0 1px 0 rgba(0,0,0,0.3)`
      : 'none',
    boxShadow: variant === 'default'
      ? `0 1px 2px rgba(0,0,0,0.15)`
      : 'none',
    ...getBackgroundStyle(),
  }

  return (
    <div
      className={cn("select-none", className)}
      style={badgeStyle}
      title={tech}
      {...props}
    >
      {renderIcon()}
      <span style={{ lineHeight: 1 }}>{tech}</span>
    </div>
  )
}

// Legacy exports for backward compatibility
function getTechColor(tech: string): { bg: string; text: string } {
  const { color } = getTechInfo(tech)
  return { bg: color, text: getContrastColor(color) }
}

export { TechBadge, getTechColor, TECH_COLORS, getTechInfo }
