import axios from 'axios'
import { useAppStore } from '@/stores/appStore'

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Dynamic base URL interceptor for Electron/Web dual mode
apiClient.interceptors.request.use((config) => {
  const { backendUrl, isElectronApp } = useAppStore.getState()

  // Set base URL based on environment
  if (isElectronApp && backendUrl) {
    config.baseURL = `${backendUrl}/api`
  } else {
    config.baseURL = '/api' // Web: use Vite proxy
  }

  // Add user_id to all requests
  const userId = localStorage.getItem('user_id')
  if (userId && config.params) {
    config.params.user_id = userId
  } else if (userId) {
    config.params = { user_id: userId }
  }

  return config
})

export default apiClient
