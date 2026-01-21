import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/userStore'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  FileText,
  Settings,
  History,
  Github,
  FileOutput,
} from 'lucide-react'

const getNavigation = (t: (key: string) => string) => [
  { name: t('navigation:dashboard'), href: '/dashboard', icon: LayoutDashboard },
  { name: t('navigation:companies'), href: '/knowledge/companies', icon: Building2 },
  { name: t('navigation:githubRepos'), href: '/github/repos', icon: Github },
  { name: t('navigation:projects'), href: '/knowledge/projects', icon: FolderKanban },
  { name: t('navigation:templates'), href: '/templates', icon: FileText },
  { name: t('navigation:generate'), href: '/generate', icon: FileOutput },
  { name: t('navigation:documents'), href: '/documents', icon: FileText },
  { name: t('navigation:history'), href: '/history', icon: History },
]

export default function Layout() {
  const location = useLocation()
  const { user } = useUserStore()
  const { t } = useTranslation()
  const navigation = getNavigation(t)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 px-6 py-4 border-b">
            <FileOutput className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Autopolio</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-700 hover:bg-gray-100'
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
            {/* Settings link - small, above profile */}
            <Link
              to="/settings"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors',
                location.pathname === '/settings'
                  ? 'text-primary bg-primary/5'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              <Settings className="h-3.5 w-3.5" />
              {t('common:settings')}
            </Link>

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
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-600 font-medium">
                        {user.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    {user.github_username && (
                      <p className="text-xs text-gray-500 truncate flex items-center gap-1">
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
      <main className="pl-64">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
