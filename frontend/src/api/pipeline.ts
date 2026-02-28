import apiClient, { ANALYSIS_TIMEOUT } from './client'

export interface PipelineStep {
  step_number: number
  step_name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at: string | null
  completed_at: string | null
  result: Record<string, unknown> | null
  error: string | null
  skip_reason: string | null
}

export interface PipelineRunRequest {
  project_ids: number[]
  company_ids?: number[]
  template_id: number
  output_format?: string
  // Auto-analyze unanalyzed projects before generation
  auto_analyze?: boolean
  document_name?: string
  include_achievements?: boolean
  include_tech_stack?: boolean
  // LLM settings (for auto-analysis)
  llm_provider?: string
  cli_mode?: 'claude_code' | 'gemini_cli' | 'codex_cli'
  cli_model?: string
}

export interface PipelineStatus {
  task_id: string
  status: string
  progress: number
  current_step: number
  total_steps: number
  steps: PipelineStep[]
  started_at: string | null
  completed_at: string | null
  estimated_completion: string | null
  result: Record<string, unknown> | null
  error: string | null
}

export interface PipelineResult {
  task_id: string
  status: string
  document_id: number
  document_name: string
  file_path: string
  file_format: string
  file_size: number
  generation_time_seconds: number
  steps_completed: number
  projects_processed: number
  llm_tokens_used: number | null
  llm_execution_mode: string | null
  llm_cli_type: string | null
}

export interface Job {
  id: number
  task_id: string
  user_id: number
  job_type: string
  status: string
  progress: number
  current_step: number
  total_steps: number
  step_name: string | null
  step_results: Record<string, unknown> | null
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
  error_message: string | null
  error_details: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  estimated_completion: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// Longer timeout for pipeline operations (60 seconds for status polling)
const PIPELINE_STATUS_TIMEOUT = 60000

export const pipelineApi = {
  run: (userId: number, data: PipelineRunRequest) =>
    apiClient.post<Job>('/pipeline/run', data, {
      params: { user_id: userId },
      timeout: ANALYSIS_TIMEOUT, // 5 minutes for pipeline execution
    }),

  getStatus: (taskId: string) =>
    apiClient.get<PipelineStatus>(`/pipeline/tasks/${taskId}`, {
      timeout: PIPELINE_STATUS_TIMEOUT, // 60 seconds for status polling
    }),

  getResult: (taskId: string) =>
    apiClient.get<PipelineResult>(`/pipeline/tasks/${taskId}/result`, {
      timeout: PIPELINE_STATUS_TIMEOUT,
    }),

  cancel: (taskId: string) =>
    apiClient.post(`/pipeline/tasks/${taskId}/cancel`),

  getJobs: (userId: number, params?: {
    job_type?: string
    status?: string
    skip?: number
    limit?: number
  }) =>
    apiClient.get<{ jobs: Job[]; total: number; page: number; page_size: number }>(
      '/pipeline/jobs',
      { params: { user_id: userId, ...params } }
    ),
}
