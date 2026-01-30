import type { EffectiveRepoAnalysis, EditStatus } from '@/api/github'
import type { DetailedReportData, FinalReportData } from '@/api/documents'
import type { StructuredItem } from '@/components/EditableStructuredList'

export interface BasicInfoTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  editStatus?: EditStatus
  t: (key: string, options?: any) => string
  onSaveKeyTasks: (items: string[]) => Promise<void>
  onResetKeyTasks: () => Promise<void>
}

export interface SummaryTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  final: FinalReportData | undefined
  editStatus?: EditStatus
  t: (key: string, options?: any) => string
  onSaveKeyTasks: (items: string[]) => Promise<void>
  onResetKeyTasks: () => Promise<void>
}

export interface DetailTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  detailed: DetailedReportData | undefined
  editStatus?: EditStatus
  onSaveImplementationDetails: (sections: StructuredItem[]) => Promise<void>
  onResetImplementationDetails: () => Promise<void>
  onSaveDetailedAchievements?: (achievements: Record<string, any>) => Promise<void>
  onResetDetailedAchievements?: () => Promise<void>
  t: (key: string, options?: any) => string
}
