import axios from 'axios'
import type { SessionUser } from './session'

const API = import.meta.env.VITE_API_URL

export interface AuthResponse {
  token: string
  user: SessionUser
  message?: string
}

export interface RegisterData {
  name: string
  email: string
  countryCode: string
  phone: string
  password: string
}

export const googleLoginRequest = async (token: string): Promise<AuthResponse> => {
  const response = await axios.post<AuthResponse>(`${API}/auth/google-login`, {
    token,
  })

  return response.data
}

export const loginRequest = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const response = await axios.post<AuthResponse>(`${API}/auth/login`, {
    email,
    password,
  })

  return response.data
}

export const registerRequest = async (
  data: RegisterData
): Promise<AuthResponse> => {
  const response = await axios.post<AuthResponse>(`${API}/auth/register`, data)

  return response.data
}
