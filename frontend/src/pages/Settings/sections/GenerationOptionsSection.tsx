import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usersApi, GenerationOptionsUpdate } from '@/api/users'
import { Loader2, Sparkles, Languages, Gauge } from 'lucide-react'

export default function GenerationOptionsSection() {
  const { t } = useTranslation('settings')
  const { toast } = useToast()
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  const { data: options, isLoading } = useQuery({
    queryKey: ['generation-options', user?.id],
    queryFn: () => usersApi.getGenerationOptions(user!.id),
    enabled: !!user?.id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: GenerationOptionsUpdate) =>
      usersApi.updateGenerationOptions(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation-options', user?.id] })
      toast({ title: t('generationOptions.saved') })
    },
    onError: () => {
      toast({ title: t('common:error'), variant: 'destructive' })
    },
  })

  const handleUpdate = (update: GenerationOptionsUpdate) => {
    updateMutation.mutate(update)
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          {t('generationOptions.loginRequired')}
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  const currentOptions = options?.data || {
    default_summary_style: 'professional',
    default_analysis_language: 'ko',
    default_analysis_scope: 'standard',
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          {t('generationOptions.title')}
        </h2>
        <p className="text-muted-foreground">{t('generationOptions.description')}</p>
      </div>

      {/* AI Analysis Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t('generationOptions.analysisSettings')}
          </CardTitle>
          <CardDescription>{t('generationOptions.analysisSettingsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Style */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t('generationOptions.summaryStyle')}
            </Label>
            <Select
              value={currentOptions.default_summary_style}
              onValueChange={(value) => handleUpdate({ default_summary_style: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">{t('generationOptions.styles.professional')}</SelectItem>
                <SelectItem value="casual">{t('generationOptions.styles.casual')}</SelectItem>
                <SelectItem value="technical">{t('generationOptions.styles.technical')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('generationOptions.summaryStyleDesc')}</p>
          </div>

          {/* Analysis Language */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Languages className="h-4 w-4" />
              {t('generationOptions.analysisLanguage')}
            </Label>
            <Select
              value={currentOptions.default_analysis_language}
              onValueChange={(value) => handleUpdate({ default_analysis_language: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">{t('generationOptions.languages.ko')}</SelectItem>
                <SelectItem value="en">{t('generationOptions.languages.en')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('generationOptions.analysisLanguageDesc')}</p>
          </div>

          {/* Analysis Scope */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              {t('generationOptions.analysisScope')}
            </Label>
            <Select
              value={currentOptions.default_analysis_scope}
              onValueChange={(value) => handleUpdate({ default_analysis_scope: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">{t('generationOptions.scopes.quick')}</SelectItem>
                <SelectItem value="standard">{t('generationOptions.scopes.standard')}</SelectItem>
                <SelectItem value="detailed">{t('generationOptions.scopes.detailed')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('generationOptions.analysisScopeDesc')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
