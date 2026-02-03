import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Paintbrush, Monitor, Globe, Bell, Bot, User } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUserStore } from '@/stores/userStore'

import AppearanceSection from './sections/AppearanceSection'
import DisplaySection from './sections/DisplaySection'
import LanguageSection from './sections/LanguageSection'
import NotificationsSection from './sections/NotificationsSection'
import LLMSection from './sections/LLMSection'
import AccountSection from './sections/AccountSection'

type SectionId = 'appearance' | 'display' | 'language' | 'notifications' | 'llm' | 'account'

interface SidebarItem {
  id: SectionId
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  requiresAuth?: boolean
}

// Account and AI Providers at top (integration items)
const integrationItems: SidebarItem[] = [
  { id: 'account', labelKey: 'sidebar.account', icon: User, requiresAuth: true },
  { id: 'llm', labelKey: 'sidebar.aiProviders', icon: Bot },
]

// General settings below
const generalItems: SidebarItem[] = [
  { id: 'appearance', labelKey: 'sidebar.appearance', icon: Paintbrush },
  { id: 'display', labelKey: 'sidebar.display', icon: Monitor },
  { id: 'language', labelKey: 'sidebar.language', icon: Globe },
  { id: 'notifications', labelKey: 'sidebar.notifications', icon: Bell },
]

export default function SettingsLayout() {
  const { t } = useTranslation('settings')
  const { user } = useUserStore()
  const isLoggedIn = !!user

  // Default to 'account' if logged in, otherwise 'llm'
  const [activeSection, setActiveSection] = useState<SectionId>(isLoggedIn ? 'account' : 'llm')

  // Update active section if user logs out while on account section
  useEffect(() => {
    if (!isLoggedIn && activeSection === 'account') {
      setActiveSection('llm')
    }
  }, [isLoggedIn, activeSection])

  const renderSection = () => {
    switch (activeSection) {
      case 'appearance':
        return <AppearanceSection />
      case 'display':
        return <DisplaySection />
      case 'language':
        return <LanguageSection />
      case 'notifications':
        return <NotificationsSection />
      case 'llm':
        return <LLMSection />
      case 'account':
        return <AccountSection />
      default:
        return <AppearanceSection />
    }
  }

  const renderSidebarItem = (item: SidebarItem) => {
    // Hide items that require auth when not logged in
    if (item.requiresAuth && !isLoggedIn) {
      return null
    }

    return (
      <button
        key={item.id}
        onClick={() => setActiveSection(item.id)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          activeSection === item.id
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground'
        )}
      >
        <item.icon className="h-4 w-4" />
        {t(item.labelKey)}
      </button>
    )
  }

  // Filter integration items based on login state
  const visibleIntegrationItems = integrationItems.filter(
    item => !item.requiresAuth || isLoggedIn
  )

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card shrink-0">
        <div className="p-4">
          <h1 className="text-lg font-semibold">{t('title')}</h1>
        </div>
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="px-3 py-2">
            {/* Integration items at top (Account, AI Providers) */}
            {visibleIntegrationItems.length > 0 && (
              <>
                <div className="space-y-1">
                  {integrationItems.map(renderSidebarItem)}
                </div>
                <Separator className="my-4" />
              </>
            )}
            {/* General settings */}
            <div className="space-y-1">
              {generalItems.map(renderSidebarItem)}
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <div className="p-6 max-w-2xl">
            {renderSection()}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
