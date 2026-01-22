import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotificationState {
  onTaskComplete: boolean
  onTaskFailed: boolean
  onReviewNeeded: boolean
  soundEnabled: boolean
  setOnTaskComplete: (value: boolean) => void
  setOnTaskFailed: (value: boolean) => void
  setOnReviewNeeded: (value: boolean) => void
  setSoundEnabled: (value: boolean) => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      onTaskComplete: true,
      onTaskFailed: true,
      onReviewNeeded: true,
      soundEnabled: false,

      setOnTaskComplete: (value) => set({ onTaskComplete: value }),
      setOnTaskFailed: (value) => set({ onTaskFailed: value }),
      setOnReviewNeeded: (value) => set({ onReviewNeeded: value }),
      setSoundEnabled: (value) => set({ soundEnabled: value }),
    }),
    {
      name: 'notification-storage',
    }
  )
)
