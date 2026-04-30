import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { auth, provider } from '../firebase'
import { loginRequest, googleLoginRequest } from '../services/authService'
import '../styles/auth.css'

function Login() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setError('') // clear error on type
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const data = await loginRequest(formData.email, formData.password)

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      navigate('/dashboard')
    } catch (err) {
      console.log(err)
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.')
    }
  }

  const handleGoogleLogin = async () => {
    try {
      setError('')
      const result = await signInWithPopup(auth, provider)
      const firebaseToken = await result.user.getIdToken()
      const data = await googleLoginRequest(firebaseToken)

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      navigate('/dashboard')
    } catch (err) {
      console.log(err)
      setError('Google login failed. Please try again.')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-header">
        <Link to="/">XPLOR</Link>
      </div>
      <div className="auth-form-container">
        <div className="auth-card">
          <h2>Welcome Back</h2>
          <p>Log in to continue to XPLOR</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
            />

            <button type="submit" className="auth-btn">
              Log In
            </button>
          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <button className="google-btn" onClick={handleGoogleLogin}>
            Continue with Google
          </button>

          <p className="auth-footer-text">
            Don't have an account? <Link to="/signup">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login