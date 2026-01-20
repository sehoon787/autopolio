import { create } from 'zustand'
import { PipelineStatus, PipelineRunRequest } from '@/api/pipeline'

interface PipelineState {
  currentTaskId: string | null
  status: PipelineStatus | null
  request: PipelineRunRequest | null
  setTaskId: (taskId: string | null) => void
  setStatus: (status: PipelineStatus | null) => void
  setRequest: (request: PipelineRunRequest | null) => void
  reset: () => void
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  currentTaskId: null,
  status: null,
  request: null,
  setTaskId: (currentTaskId) => set({ currentTaskId }),
  setStatus: (status) => set({ status }),
  setRequest: (request) => set({ request }),
  reset: () => set({ currentTaskId: null, status: null, request: null }),
}))
