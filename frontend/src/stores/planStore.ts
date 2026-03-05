import { create } from 'zustand'
import { UserTierType, USER_TIERS } from '@/constants/enums'
import { TierLimits, usersApi } from '@/api/users'

interface PlanState {
  tier: UserTierType
  limits: TierLimits | null
  usage: {
    projects: number
    llm_calls_this_month: number
    year_month: string
  } | null
  isLoading: boolean
  fetchPlan: (userId: number) => Promise<void>
  reset: () => void
}

export const usePlanStore = create<PlanState>((set) => ({
  tier: USER_TIERS.FREE,
  limits: null,
  usage: null,
  isLoading: false,

  fetchPlan: async (userId: number) => {
    set({ isLoading: true })
    try {
      const response = await usersApi.getUsage(userId)
      const data = response.data
      set({
        tier: data.tier as UserTierType,
        limits: data.limits,
        usage: data.usage,
        isLoading: false,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  reset: () => set({
    tier: USER_TIERS.FREE,
    limits: null,
    usage: null,
    isLoading: false,
  }),
}))
