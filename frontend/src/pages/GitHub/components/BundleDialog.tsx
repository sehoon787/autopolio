import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Star } from 'lucide-react'
import type { BundleRepoEntry } from '../hooks/useRepoSelector'

interface BundleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  onProjectNameChange: (name: string) => void
  repos: BundleRepoEntry[]
  onSetPrimary: (url: string) => void
  onLabelChange: (url: string, label: string) => void
  onSubmit: () => void
  isPending: boolean
}

export function BundleDialog({
  open, onOpenChange, projectName, onProjectNameChange,
  repos, onSetPrimary, onLabelChange, onSubmit, isPending,
}: BundleDialogProps) {
  const { t } = useTranslation('github')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('bundleDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('bundleDialog.primaryNote')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('bundleDialog.projectName')}</label>
            <Input
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              placeholder={t('bundleDialog.projectNamePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('bundleDialog.selectedRepos', { count: repos.length })}
            </label>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {repos.map((repo) => (
                <div
                  key={repo.url}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => onSetPrimary(repo.url)}
                    className="shrink-0 text-lg leading-none hover:scale-110 transition-transform"
                    title={repo.isPrimary ? 'Primary' : 'Set as primary'}
                  >
                    {repo.isPrimary ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <Star className="h-4 w-4 text-gray-300" />
                    )}
                  </button>
                  <span className="text-sm font-medium truncate min-w-0 flex-1" title={repo.name}>
                    {repo.name}
                  </span>
                  <Input
                    value={repo.label}
                    onChange={(e) => onLabelChange(repo.url, e.target.value)}
                    placeholder={t('bundleDialog.labelPlaceholder')}
                    className="w-[120px] shrink-0 h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('bundleDialog.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !projectName.trim()}
          >
            {isPending ? t('bundleDialog.creating') : t('bundleDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
