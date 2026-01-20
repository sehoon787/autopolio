import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add user_id to all requests
apiClient.interceptors.request.use((config) => {
  const userId = localStorage.getItem('user_id')
  if (userId && config.params) {
    config.params.user_id = userId
  } else if (userId) {
    config.params = { user_id: userId }
  }
  return config
})

export default apiClient
