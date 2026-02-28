import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Terminal,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
} from 'lucide-react'
import { getModelDisplayName } from '@/lib/model-display'
import type { TestResult, CurrentSelection } from './types'

interface CurrentSelectionCardProps {
  aiMode: 'cli' | 'api'
  currentSelection: CurrentSelection
  testResult: TestResult | null
  isTestingCLI: boolean
  isTestingProvider: boolean
  onTest: () => void
}

export function CurrentSelectionCard({
  aiMode,
  currentSelection,
  testResult,
  isTestingCLI,
  isTestingProvider,
  onTest,
}: CurrentSelectionCardProps) {
  const { t } = useTranslation('settings')
  const isTesting = isTestingCLI || isTestingProvider

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {aiMode === 'cli' ? <Terminal className="h-4 w-4" /> : <Key className="h-4 w-4" />}
          {t('llm.currentSelection', 'Current Selection')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={aiMode === 'cli' ? 'default' : 'secondary'}>
              {currentSelection.type}
            </Badge>
            <span className="font-medium">{currentSelection.name}</span>
            {aiMode === 'cli' && currentSelection.installed && (
              <span className="text-sm text-muted-foreground">v{currentSelection.version}</span>
            )}
            {aiMode === 'api' && 'model' in currentSelection && (
              <span className="text-sm text-muted-foreground">{getModelDisplayName(currentSelection.model || '')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {aiMode === 'cli' && currentSelection.installed && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {aiMode === 'cli' && !currentSelection.installed && (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            {aiMode === 'api' && 'configured' in currentSelection && currentSelection.configured && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {aiMode === 'api' && 'configured' in currentSelection && !currentSelection.configured && (
              <XCircle className="h-4 w-4 text-yellow-500" />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onTest}
              disabled={isTesting || (aiMode === 'cli' && !currentSelection.installed)}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {t('llm.test', 'Test')}
            </Button>
          </div>
        </div>
        {testResult && (
          <div className={`mt-3 p-2 rounded text-sm ${
            testResult.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {testResult.message}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
