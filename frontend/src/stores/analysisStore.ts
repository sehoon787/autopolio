import { create } from 'zustand'
import { githubApi, AnalysisJobStatus } from '@/api/github'

interface AnalysisState {
  // Map of project ID to active job
  activeJobs: Map<number, AnalysisJobStatus>

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
    }
  ) => Promise<{ task_id: string; project_id: number }>
  cancelAnalysis: (userId: number, projectId: number) => Promise<void>
}

export const useAnalysisStore = create<AnalysisState>()((set, get) => ({
  activeJobs: new Map(),
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
      for (const job of jobs) {
        if (job.project_id) {
          jobMap.set(job.project_id, job)
        }
      }

      set({ activeJobs: jobMap })

      // Stop polling if no active jobs
      if (jobMap.size === 0) {
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
