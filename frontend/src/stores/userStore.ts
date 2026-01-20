import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, UserStats } from '@/api/users'

interface UserState {
  user: User | null
  stats: UserStats | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setStats: (stats: UserStats | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      stats: null,
      isLoading: false,
      setUser: (user) => {
        set({ user })
        if (user) {
          localStorage.setItem('user_id', String(user.id))
        } else {
          localStorage.removeItem('user_id')
        }
      },
      setStats: (stats) => set({ stats }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        set({ user: null, stats: null })
        localStorage.removeItem('user_id')
      },
    }),
    {
      name: 'user-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
