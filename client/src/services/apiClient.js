// Shared axios instance for all authenticated API calls.
//   - baseURL comes from config (never hardcode hosts)
//   - the request interceptor attaches the bearer token automatically
//   - the response interceptor clears the session and bounces to /login on 401
//     so an expired/invalid token can't leave the UI in a broken state.
import axios from 'axios'
import { getToken, clearSession } from './session'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession()
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
