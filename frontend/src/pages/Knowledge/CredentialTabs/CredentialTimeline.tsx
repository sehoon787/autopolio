import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, GraduationCap, BookOpen, FileText, ScrollText, IdCard, Trophy, Heart, Users } from 'lucide-react'

export type CredentialKind =
  | 'academic' | 'training' | 'publication' | 'patent'
  | 'certification' | 'award' | 'volunteer' | 'external'

export interface TimelineItem {
  id: number
  kind: CredentialKind
  title: string
  subtitle: string | null
  dateLabel: string
  sortDate: string
  isCurrent: boolean
  badge: string | null
  url: string | null
  description: string | null
}

const KIND_CONFIG: Record<CredentialKind, { icon: typeof GraduationCap; color: string }> = {
  academic:      { icon: GraduationCap, color: 'bg-blue-500' },
  training:      { icon: BookOpen,      color: 'bg-cyan-500' },
  publication:   { icon: FileText,      color: 'bg-green-500' },
  patent:        { icon: ScrollText,    color: 'bg-amber-600' },
  certification: { icon: IdCard,        color: 'bg-teal-500' },
  award:         { icon: Trophy,        color: 'bg-yellow-500' },
  volunteer:     { icon: Heart,         color: 'bg-pink-500' },
  external:      { icon: Users,         color: 'bg-purple-500' },
}

interface CredentialTimelineProps {
  items: TimelineItem[]
  isLoading?: boolean
}

export function CredentialTimeline({ items, isLoading }: CredentialTimelineProps) {
  const { t } = useTranslation('credentials')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GraduationCap className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('timeline.noItems')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-0">
      {items.map((item, index) => {
        const config = KIND_CONFIG[item.kind]
        const Icon = config.icon
        const isFirst = index === 0
        const isLast = index === items.length - 1

        return (
          <div key={`${item.kind}-${item.id}`} className="relative flex gap-4">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-border'}`} />
              <div className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full ${config.color} text-white shrink-0`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-border'}`} />
            </div>

            {/* Card */}
            <Card className="flex-1 mb-3 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm truncate">{item.title}</h4>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t(`timeline.kindLabel.${item.kind}`)}
                      </Badge>
                      {item.badge && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {item.badge}
                        </Badge>
                      )}
                      {item.isCurrent && (
                        <Badge variant="success" className="text-[10px] shrink-0">
                          {t('timeline.present')}
                        </Badge>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                    )}
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {item.dateLabel}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
