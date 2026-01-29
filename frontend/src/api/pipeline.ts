import apiClient from './client'

export interface PipelineStep {
  step_number: number
  step_name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at: string | null
  completed_at: string | null
  result: Record<string, unknown> | null
  error: string | null
}

export interface PipelineRunRequest {
  project_ids: number[]
  company_ids?: number[]
  template_id: number
  output_format?: string
  skip_github_analysis?: boolean
  skip_llm_summary?: boolean
  regenerate_summaries?: boolean
  document_name?: string
  include_achievements?: boolean
  include_tech_stack?: boolean
  llm_provider?: string
  summary_style?: string
  // CLI mode settings
  cli_mode?: 'claude_code' | 'gemini_cli'
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

export const pipelineApi = {
  run: (userId: number, data: PipelineRunRequest) =>
    apiClient.post<Job>('/pipeline/run', data, { params: { user_id: userId } }),

  getStatus: (taskId: string) =>
    apiClient.get<PipelineStatus>(`/pipeline/tasks/${taskId}`),

  getResult: (taskId: string) =>
    apiClient.get<PipelineResult>(`/pipeline/tasks/${taskId}/result`),

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
