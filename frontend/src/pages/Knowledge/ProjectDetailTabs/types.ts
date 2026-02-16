import type { EffectiveRepoAnalysis, EditStatus, ContributorAnalysis, MultiRepoAnalysisResponse } from '@/api/github'
import type { DetailedReportData, FinalReportData } from '@/api/documents'
import type { StructuredItem } from '@/components/EditableStructuredList'

export interface BasicInfoTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  editStatus?: EditStatus
  t: (key: string, options?: any) => string
  onSaveKeyTasks: (items: string[]) => Promise<void>
  onResetKeyTasks: () => Promise<void>
  contributorAnalysis?: ContributorAnalysis
  companies?: Array<{ id: number; name: string }>
  perRepoAnalyses?: MultiRepoAnalysisResponse
}

export interface SummaryTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  final: FinalReportData | undefined
  detailed: DetailedReportData | undefined
  editStatus?: EditStatus
  t: (key: string, options?: any) => string
  onSaveKeyTasks: (items: string[]) => Promise<void>
  onResetKeyTasks: () => Promise<void>
  contributorAnalysis?: ContributorAnalysis
  perRepoAnalyses?: MultiRepoAnalysisResponse
}

export interface DetailTabProps {
  project: any
  analysis: EffectiveRepoAnalysis | undefined
  detailed: DetailedReportData | undefined
  editStatus?: EditStatus
  onSaveImplementationDetails: (sections: StructuredItem[]) => Promise<void>
  onResetImplementationDetails: () => Promise<void>
  t: (key: string, options?: any) => string
  contributorAnalysis?: ContributorAnalysis
  perRepoAnalyses?: MultiRepoAnalysisResponse
}
