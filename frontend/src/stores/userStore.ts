import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, UserStats } from '@/api/users'

interface UserState {
  user: User | null
  stats: UserStats | null
  isLoading: boolean
  isGuest: boolean
  setUser: (user: User | null) => void
  setStats: (stats: UserStats | null) => void
  setLoading: (loading: boolean) => void
  setGuest: (isGuest: boolean) => void
  logout: () => void
  startGuestMode: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      stats: null,
      isLoading: false,
      isGuest: false,
      setUser: (user) => {
        set({ user, isGuest: false })
        if (user) {
          localStorage.setItem('user_id', String(user.id))
        } else {
          localStorage.removeItem('user_id')
        }
      },
      setStats: (stats) => set({ stats }),
      setLoading: (isLoading) => set({ isLoading }),
      setGuest: (isGuest) => set({ isGuest }),
      logout: () => {
        set({ user: null, stats: null, isGuest: true })
        localStorage.removeItem('user_id')
        // Keep guest mode active after logout
        // Clear guest data
        localStorage.removeItem('guest-data')
      },
      startGuestMode: () => {
        set({ user: null, stats: null, isGuest: true })
        localStorage.removeItem('user_id')
        // Initialize empty guest data
        localStorage.setItem('guest-data', JSON.stringify({
          companies: [],
          projects: [],
          credentials: [],
        }))
      },
    }),
    {
      name: 'user-storage',
      partialize: (state) => ({ user: state.user, isGuest: state.isGuest }),
    }
  )
)
