import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { useThemeStore } from '@/stores/themeStore'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UsageDisplay } from '@/components/UsageDisplay'
import { RateLimitBanner } from '@/components/RateLimitBanner'
import { Logo } from '@/components/Logo'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  FileText,
  Settings,
  History,
  Github,
  FileOutput,
  Globe,
  FileStack,
  ChevronDown,
} from 'lucide-react'

// Type definitions for navigation
interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  name: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

type NavigationItem = NavItem | NavGroup

const isNavGroup = (item: NavigationItem): item is NavGroup => 'items' in item

const getNavigation = (t: (key: string) => string): NavigationItem[] => [
  { name: t('navigation:dashboard'), href: '/dashboard', icon: LayoutDashboard },
  { name: t('navigation:companies'), href: '/knowledge/companies', icon: Building2 },
  { name: t('navigation:githubRepos'), href: '/github/repos', icon: Github },
  { name: t('navigation:projects'), href: '/knowledge/projects', icon: FolderKanban },
  { name: t('navigation:platforms'), href: '/platforms', icon: Globe },
  {
    name: t('navigation:documentManagement'),
    icon: FileStack,
    items: [
      { name: t('navigation:templates'), href: '/templates', icon: FileText },
      { name: t('navigation:generate'), href: '/generate', icon: FileOutput },
      { name: t('navigation:documents'), href: '/documents', icon: FileText },
      { name: t('navigation:history'), href: '/history', icon: History },
    ]
  },
]

// Collapsible navigation group component
function CollapsibleNavGroup({ group, isAnyChildActive }: {
  group: NavGroup
  isAnyChildActive: boolean
}) {
  const [isOpen, setIsOpen] = useState(isAnyChildActive)
  const location = useLocation()
  const Icon = group.icon

  // Auto-expand when a child becomes active
  useEffect(() => {
    if (isAnyChildActive && !isOpen) {
      setIsOpen(true)
    }
  }, [isAnyChildActive, isOpen])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className={cn(
        'flex items-center justify-between w-full px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isAnyChildActive
          ? 'text-primary'
          : 'text-foreground/80 hover:bg-accent'
      )}>
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" />
          {group.name}
        </div>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 mt-1 space-y-1">
        {group.items.map((item) => {
          const isActive = location.pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/80 hover:bg-accent'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function Layout() {
  const location = useLocation()
  const { user } = useUserStore()
  const { t } = useTranslation()
  const { initializeTheme } = useThemeStore()
  const navigation = getNavigation(t)

  useEffect(() => {
    initializeTheme()
  }, [initializeTheme])

  return (
    <div className="h-screen overflow-hidden bg-background">
      {/* Rate Limit Banner */}
      <RateLimitBanner />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 px-6 py-4 border-b">
            <Logo size={32} />
            <span className="text-xl font-bold">Autopolio</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item, index) => {
              if (isNavGroup(item)) {
                const isAnyChildActive = item.items.some(
                  child => location.pathname.startsWith(child.href)
                )
                return (
                  <CollapsibleNavGroup
                    key={index}
                    group={item}
                    isAnyChildActive={isAnyChildActive}
                  />
                )
              }

              const isActive = location.pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/80 hover:bg-accent'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Settings & User section */}
          <div className="border-t">
            {/* Usage display */}
            <div className="px-4 py-2 border-b">
              <UsageDisplay compact />
            </div>

            {/* Settings link with theme toggle */}
            <div className="flex items-center justify-between px-4 py-2">
              <Link
                to="/settings"
                className={cn(
                  'flex items-center gap-2 text-xs font-medium transition-colors',
                  location.pathname === '/settings'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Settings className="h-3.5 w-3.5" />
                {t('common:settings')}
              </Link>
              <ThemeToggle />
            </div>

            {/* User profile */}
            <div className="p-4 pt-2">
              {user ? (
                <div className="flex items-center gap-3">
                  {user.github_avatar_url ? (
                    <img
                      src={user.github_avatar_url}
                      alt={user.name}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground font-medium">
                        {user.name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                    {user.github_username && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Github className="h-3 w-3" />
                        {user.github_username}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <Link
                  to="/setup"
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-md"
                >
                  <Settings className="h-5 w-5" />
                  {t('navigation:setup')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64 h-screen overflow-y-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
