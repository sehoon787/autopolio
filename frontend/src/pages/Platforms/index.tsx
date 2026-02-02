import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { platformsApi, PlatformTemplateListItem } from '@/api/platforms'
import { usersApi } from '@/api/users'
import { useUserStore } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getPlatformIcon } from '@/components/icons/PlatformIcons'

export default function PlatformsPage() {
  const { t } = useTranslation(['platforms', 'common'])
  const navigate = useNavigate()
  const { user } = useUserStore()

  // Fetch platform templates
  const {
    data: templatesData,
    isLoading,
  } = useQuery({
    queryKey: ['platformTemplates'],
    queryFn: () => platformsApi.getAll(),
  })

  // Fetch user stats to check for analyzed projects
  const { data: statsData } = useQuery({
    queryKey: ['userStats', user?.id],
    queryFn: () => usersApi.getStats(user!.id),
    enabled: !!user?.id,
  })

  const templates = templatesData?.data?.templates || []
  const hasAnalyzedData = (statsData?.data?.analyzed_projects_count ?? 0) > 0

  const handleExport = (templateId: number) => {
    navigate(`/platforms/${templateId}/export`)
  }

  const handlePreview = (templateId: number) => {
    navigate(`/platforms/${templateId}/preview`)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('noTemplates')}</h3>
            <p className="text-muted-foreground">
              {t('noTemplatesDescription')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <PlatformCard
              key={template.id}
              template={template}
              onExport={() => handleExport(template.id)}
              onPreview={() => handlePreview(template.id)}
              hasAnalyzedData={hasAnalyzedData}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface PlatformCardProps {
  template: PlatformTemplateListItem
  onExport: () => void
  onPreview: () => void
  hasAnalyzedData: boolean
}

function PlatformCard({ template, onExport, onPreview, hasAnalyzedData }: PlatformCardProps) {
  const { t } = useTranslation(['platforms', 'common'])

  return (
    <Card
      className="overflow-hidden hover:shadow-lg transition-shadow"
      style={{
        borderTop: `4px solid ${template.platform_color || '#666'}`,
      }}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center">
            {getPlatformIcon(template.platform_key, 48)}
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              {template.name}
              {template.is_system && (
                <Badge variant="secondary" className="text-xs">
                  {t('systemTemplate')}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>{template.platform_key}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {template.description && (
          <p className="text-sm text-muted-foreground mb-4">
            {template.description}
          </p>
        )}

        {template.features && template.features.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('features')}:</p>
            <div className="flex flex-wrap gap-2">
              {template.features.slice(0, 4).map((feature, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onPreview}>
          <Eye className="h-4 w-4 mr-2" />
          {t('preview')}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1">
                <Button
                  className="w-full"
                  onClick={onExport}
                  disabled={!hasAnalyzedData}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('export')}
                </Button>
              </span>
            </TooltipTrigger>
            {!hasAnalyzedData && (
              <TooltipContent>
                <p>{t('exportDisabledNoData')}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  )
}
