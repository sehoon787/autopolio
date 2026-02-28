import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ProjectFormFields } from '@/components/ProjectFormFields'
import { formatDate } from '@/lib/utils'
import type { useTimelineProjectCrud } from '../hooks/useTimelineProjectCrud'

interface TimelineProjectDialogsProps {
  crud: ReturnType<typeof useTimelineProjectCrud>
}

export function TimelineProjectDialogs({ crud }: TimelineProjectDialogsProps) {
  const { t: tc } = useTranslation('common')
  const { t: tp } = useTranslation('projects')
  const { t } = useTranslation('companies')

  return (
    <>
      {/* Create Project Dialog */}
      <Dialog open={crud.isCreateDialogOpen} onOpenChange={crud.setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tp('dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleCreateSubmit} className="space-y-4">
            <ProjectFormFields
              formData={crud.createForm.formData}
              onChange={crud.createForm.setFormData}
              companies={crud.companies}
              techInput={crud.createForm.techInput}
              onTechInputChange={crud.createForm.setTechInput}
              onAddTechnology={crud.createForm.addTechnology}
              onRemoveTechnology={crud.createForm.removeTechnology}
              isOngoing={crud.createForm.isOngoing}
              onOngoingChange={crud.createForm.setIsOngoing}
              onAddRepository={crud.createForm.addRepository}
              onRemoveRepository={crud.createForm.removeRepository}
              onUpdateRepository={crud.createForm.updateRepository}
              onSetPrimaryRepository={crud.createForm.setPrimaryRepository}
              githubRepos={crud.githubRepos}
              onRepoSelected={(url) => crud.handleRepoSelected(url, crud.createForm)}
              isLoadingRepoInfo={crud.isLoadingRepoInfo}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => crud.setIsCreateDialogOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={crud.createMutation.isPending}>
                {tc('add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={!!crud.editingProjectId} onOpenChange={(open) => !open && crud.setEditingProjectId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tp('editDialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleEditSubmit} className="space-y-4">
            <ProjectFormFields
              formData={crud.editForm.formData}
              onChange={crud.editForm.setFormData}
              companies={crud.companies}
              techInput={crud.editForm.techInput}
              onTechInputChange={crud.editForm.setTechInput}
              onAddTechnology={crud.editForm.addTechnology}
              onRemoveTechnology={crud.editForm.removeTechnology}
              isOngoing={crud.editForm.isOngoing}
              onOngoingChange={crud.editForm.setIsOngoing}
              onAddRepository={crud.editForm.addRepository}
              onRemoveRepository={crud.editForm.removeRepository}
              onUpdateRepository={crud.editForm.updateRepository}
              onSetPrimaryRepository={crud.editForm.setPrimaryRepository}
              githubRepos={crud.githubRepos}
              onRepoSelected={(url) => crud.handleRepoSelected(url, crud.editForm)}
              isLoadingRepoInfo={crud.isLoadingRepoInfo}
              idPrefix="timeline_edit_"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => crud.setEditingProjectId(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={crud.updateMutation.isPending}>
                {tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!crud.deleteTarget} onOpenChange={(open) => !open && crud.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tp('deleteDialog.singleDescription', { name: crud.deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (crud.deleteTarget) crud.deleteMutation.mutate(crud.deleteTarget.id)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {tp('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Project Dialog */}
      <Dialog open={crud.isLinkDialogOpen} onOpenChange={crud.setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('linkProjectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('selectProject')}</Label>
              <Select value={crud.selectedProjectId} onValueChange={crud.setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {crud.getUnlinkedProjects().map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                      {project.start_date && ` (${formatDate(project.start_date)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {crud.getUnlinkedProjects().length === 0 && (
                <p className="text-sm text-muted-foreground">{t('noUnlinkedProjects')}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => crud.setIsLinkDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={crud.handleLinkProject}
              disabled={!crud.selectedProjectId || crud.linkProjectMutation.isPending}
            >
              {t('link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
