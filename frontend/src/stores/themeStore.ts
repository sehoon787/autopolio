import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemeColor = 'default' | 'ocean' | 'forest' | 'dusk' | 'lime' | 'retro' | 'neo'

// Theme definitions with preview colors and metadata
export const THEME_DEFINITIONS: {
  id: ThemeColor
  name: string
  desc: string
  light: string
  dark: string
  accent: string
}[] = [
  { id: 'default', name: 'Default', desc: 'Classic blue', light: '#ffffff', dark: '#0a0a0a', accent: '#2563eb' },
  { id: 'ocean', name: 'Ocean', desc: 'Calm teal', light: '#f0fdfa', dark: '#042f2e', accent: '#0d9488' },
  { id: 'forest', name: 'Forest', desc: 'Natural green', light: '#f0fdf4', dark: '#052e16', accent: '#16a34a' },
  { id: 'dusk', name: 'Dusk', desc: 'Warm purple', light: '#faf5ff', dark: '#1e1b4b', accent: '#9333ea' },
  { id: 'lime', name: 'Lime', desc: 'Fresh citrus', light: '#f7fee7', dark: '#1a2e05', accent: '#65a30d' },
  { id: 'retro', name: 'Retro', desc: 'Vintage orange', light: '#fff7ed', dark: '#1c1917', accent: '#ea580c' },
  { id: 'neo', name: 'Neo', desc: 'Electric pink', light: '#fdf2f8', dark: '#1f0720', accent: '#db2777' },
]

interface ThemeState {
  mode: ThemeMode
  color: ThemeColor
  resolvedMode: 'light' | 'dark'
  uiScale: number
  setMode: (mode: ThemeMode) => void
  setColor: (color: ThemeColor) => void
  setUIScale: (scale: number) => void
  toggleMode: () => void
  initializeTheme: () => void
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: 'light' | 'dark', color: ThemeColor) {
  const root = document.documentElement

  // Apply mode
  if (mode === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Apply color theme
  root.setAttribute('data-theme', color)
}

function applyUIScale(scale: number) {
  const root = document.documentElement
  root.style.setProperty('--ui-scale', (scale / 100).toString())
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      color: 'default',
      resolvedMode: 'light',
      uiScale: 100,

      setMode: (mode) => {
        const resolvedMode = mode === 'system' ? getSystemTheme() : mode
        applyTheme(resolvedMode, get().color)
        set({ mode, resolvedMode })
      },

      setColor: (color) => {
        applyTheme(get().resolvedMode, color)
        set({ color })
      },

      setUIScale: (scale) => {
        const clampedScale = Math.max(75, Math.min(200, scale))
        applyUIScale(clampedScale)
        set({ uiScale: clampedScale })
      },

      toggleMode: () => {
        const { mode } = get()
        const newMode: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
        get().setMode(newMode)
      },

      initializeTheme: () => {
        const { mode, color, uiScale } = get()
        const resolvedMode = mode === 'system' ? getSystemTheme() : mode
        applyTheme(resolvedMode, color)
        applyUIScale(uiScale)
        set({ resolvedMode })

        // Listen for system theme changes
        if (typeof window !== 'undefined') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          const handleChange = () => {
            if (get().mode === 'system') {
              const newResolvedMode = getSystemTheme()
              applyTheme(newResolvedMode, get().color)
              set({ resolvedMode: newResolvedMode })
            }
          }
          mediaQuery.addEventListener('change', handleChange)
        }
      },
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ mode: state.mode, color: state.color, uiScale: state.uiScale }),
    }
  )
)
