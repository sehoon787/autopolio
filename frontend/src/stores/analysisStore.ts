import { create } from 'zustand'
import { githubApi, AnalysisJobStatus } from '@/api/github'
import { useUsageStore, LLMUsage } from './usageStore'

// Map LLM provider string to usage store key
function mapProviderToUsageKey(provider?: string): keyof LLMUsage | null {
  if (!provider) return null

  const providerLower = provider.toLowerCase()
  if (providerLower === 'openai' || providerLower.includes('gpt')) return 'openai'
  if (providerLower === 'anthropic' || providerLower.includes('claude')) return 'anthropic'
  if (providerLower === 'gemini' || providerLower.includes('gemini')) return 'gemini'
  if (providerLower === 'claude_code') return 'claude_code_cli'
  if (providerLower === 'gemini_cli') return 'gemini_cli'

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
    }
  ) => Promise<{ task_id: string; project_id: number }>
  cancelAnalysis: (userId: number, projectId: number) => Promise<void>
}

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

    // Start polling every 2 seconds
    const interval = setInterval(() => {
      get().refreshJobs(userId)
    }, 2000)

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
      const { processedTaskIds } = get()
      const newProcessedTaskIds = new Set(processedTaskIds)
      let hasActiveJobs = false

      for (const job of jobs) {
        if (job.project_id) {
          jobMap.set(job.project_id, job)

          // Check if this is a newly completed job with token usage
          if (
            job.status === 'completed' &&
            job.token_usage &&
            job.token_usage > 0 &&
            !processedTaskIds.has(job.task_id)
          ) {
            // Track token usage
            const provider = mapProviderToUsageKey(job.llm_provider)
            if (provider) {
              useUsageStore.getState().incrementLLMCallCount(provider)
              useUsageStore.getState().trackTokenUsage(provider, job.token_usage)
              console.log(`[AnalysisStore] Tracked ${job.token_usage} tokens for provider ${provider}`)
            }
            newProcessedTaskIds.add(job.task_id)
          }

          // Check if job is still active
          if (['pending', 'running'].includes(job.status)) {
            hasActiveJobs = true
          }
        }
      }

      set({ activeJobs: jobMap, processedTaskIds: newProcessedTaskIds })

      // Stop polling if no active jobs
      if (!hasActiveJobs) {
        get().stopPolling()
      }
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
