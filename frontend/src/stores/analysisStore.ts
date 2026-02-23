import { create } from 'zustand'
import { githubApi, AnalysisJobStatus } from '@/api/github'
import { useUsageStore, LLMUsage } from './usageStore'

// Map LLM provider string to usage store key
function mapProviderToUsageKey(provider?: string): keyof LLMUsage | null {
  if (!provider) return null

  const providerLower = provider.toLowerCase()
  // CLI providers must be checked FIRST — 'claude_code'.includes('claude') is true
  if (providerLower === 'claude_code') return 'claude_code_cli'
  if (providerLower === 'gemini_cli') return 'gemini_cli'
  // API providers
  if (providerLower === 'openai' || providerLower.includes('gpt')) return 'openai'
  if (providerLower === 'anthropic' || providerLower.includes('claude')) return 'anthropic'
  if (providerLower === 'gemini' || providerLower.includes('gemini')) return 'gemini'

  return null
}

interface AnalysisState {
  // Map of project ID to active job
  activeJobs: Map<number, AnalysisJobStatus>

  // Track task_ids that have already had tokens recorded (to avoid duplicates)
  processedTaskIds: Set<string>

  // Polling state
  isPolling: boolean
  pollingInterval: ReturnType<typeof setInterval> | null

  // Actions
  startPolling: (userId: number) => void
  stopPolling: () => void
  refreshJobs: (userId: number) => Promise<void>

  // Helpers
  isAnalyzing: (projectId: number) => boolean
  getJob: (projectId: number) => AnalysisJobStatus | undefined
  getProgress: (projectId: number) => number
  getStepName: (projectId: number) => string | undefined

  // Start/Cancel analysis
  startAnalysis: (
    userId: number,
    gitUrl: string,
    projectId?: number,
    options?: {
      provider?: string
      cli_mode?: 'claude_code' | 'gemini_cli'
      cli_model?: string
      language?: 'ko' | 'en'  // Analysis language
      project_repository_id?: number  // Specific repo in multi-repo project
    }
  ) => Promise<{ task_id: string; project_id: number }>
  cancelAnalysis: (userId: number, projectId: number) => Promise<void>
}

// Polling intervals
const FAST_POLL_MS = 2000   // 2s when analysis is running
const SLOW_POLL_MS = 30000  // 30s idle check for recently completed jobs

export const useAnalysisStore = create<AnalysisState>()((set, get) => ({
  activeJobs: new Map(),
  processedTaskIds: new Set(),
  isPolling: false,
  pollingInterval: null,

  startPolling: (userId: number) => {
    const state = get()
    if (state.isPolling) return

    // Initial fetch
    get().refreshJobs(userId)

    // Start with slow polling; refreshJobs will switch to fast when active jobs exist
    const interval = setInterval(() => {
      get().refreshJobs(userId)
    }, SLOW_POLL_MS)

    set({ isPolling: true, pollingInterval: interval })
  },

  stopPolling: () => {
    const state = get()
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval)
    }
    set({ isPolling: false, pollingInterval: null })
  },

  refreshJobs: async (userId: number) => {
    try {
      const response = await githubApi.getActiveAnalyses(userId)
      const jobs = response.data.jobs

      const jobMap = new Map<number, AnalysisJobStatus>()
      const { processedTaskIds, pollingInterval } = get()
      const newProcessedTaskIds = new Set(processedTaskIds)
      let hasActiveJobs = false

      for (const job of jobs) {
        if (job.project_id) {
          const isActive = ['pending', 'running'].includes(job.status)
          const isFinished = ['completed', 'failed', 'cancelled'].includes(job.status)
          const alreadyProcessed = processedTaskIds.has(job.task_id)

          // Track completed jobs for token usage (only once per task_id)
          if (job.status === 'completed' && !alreadyProcessed) {
            const provider = mapProviderToUsageKey(job.llm_provider)
            console.log(`[AnalysisStore] Completed job: task_id=${job.task_id}, llm_provider=${job.llm_provider}, provider_key=${provider}, token_usage=${job.token_usage}`)
            if (provider) {
              useUsageStore.getState().incrementLLMCallCount(provider)
              if (job.token_usage && job.token_usage > 0) {
                useUsageStore.getState().trackTokenUsage(provider, job.token_usage)
              }
            } else {
              console.warn(`[AnalysisStore] Could not map llm_provider "${job.llm_provider}" to usage key — tokens NOT tracked`)
            }
            newProcessedTaskIds.add(job.task_id)
          } else if (isFinished && !alreadyProcessed) {
            // Mark failed/cancelled as processed too
            newProcessedTaskIds.add(job.task_id)
          }

          if (isActive) {
            // Active jobs always go in the map
            jobMap.set(job.project_id, job)
            hasActiveJobs = true
          } else if (isFinished && !alreadyProcessed) {
            // Newly finished jobs added ONCE so ProjectDetail.tsx useEffect
            // can fire toast notifications and invalidate queries.
            // On the next poll they'll be in processedTaskIds and skipped.
            jobMap.set(job.project_id, job)
          }
          // Already-processed finished jobs are NOT re-added — prevents
          // the "stuck at 100%" bug from 10-minute retention window.
        }
      }

      set({ activeJobs: jobMap, processedTaskIds: newProcessedTaskIds })

      // Switch polling speed: fast when active, slow when idle
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
      const nextInterval = hasActiveJobs ? FAST_POLL_MS : SLOW_POLL_MS
      const newInterval = setInterval(() => {
        get().refreshJobs(userId)
      }, nextInterval)
      set({ pollingInterval: newInterval })
    } catch (error) {
      console.error('[AnalysisStore] Failed to refresh jobs:', error)
    }
  },

  isAnalyzing: (projectId: number) => {
    const job = get().activeJobs.get(projectId)
    return job ? ['pending', 'running'].includes(job.status) : false
  },

  getJob: (projectId: number) => {
    return get().activeJobs.get(projectId)
  },

  getProgress: (projectId: number) => {
    const job = get().activeJobs.get(projectId)
    return job?.progress ?? 0
  },

  getStepName: (projectId: number) => {
    const job = get().activeJobs.get(projectId)
    return job?.step_name
  },

  startAnalysis: async (userId, gitUrl, projectId, options) => {
    const response = await githubApi.startBackgroundAnalysis(
      userId,
      gitUrl,
      projectId,
      options
    )

    const { task_id, project_id } = response.data

    // Determine LLM provider for tracking
    const llm_provider = options?.cli_mode || options?.provider

    // Add to active jobs immediately
    set((state) => {
      const newJobs = new Map(state.activeJobs)
      newJobs.set(project_id, {
        task_id,
        project_id,
        status: 'pending',
        progress: 0,
        current_step: 0,
        total_steps: 6,
        created_at: new Date().toISOString(),
        llm_provider,
      })
      return { activeJobs: newJobs }
    })

    // Start polling if not already
    if (!get().isPolling) {
      get().startPolling(userId)
    }

    return { task_id, project_id }
  },

  cancelAnalysis: async (userId: number, projectId: number) => {
    await githubApi.cancelAnalysis(projectId, userId)

    // Remove from active jobs
    set((state) => {
      const newJobs = new Map(state.activeJobs)
      newJobs.delete(projectId)
      return { activeJobs: newJobs }
    })
  },
}))
