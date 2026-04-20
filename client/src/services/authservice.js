import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export const googleLoginRequest = async (token) => {
  const response = await axios.post(`${API}/auth/google-login`, {
    token,
  })

  return response.data
}

export const loginRequest = async (email, password) => {
  const response = await axios.post(`${API}/auth/login`, {
    email,
    password,
  })

  return response.data
}

export const registerRequest = async (data) => {
  const response = await axios.post(`${API}/auth/register`, data)

  return response.data
}