import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { auth, provider } from '../firebase'
import { loginRequest, googleLoginRequest } from '../services/authService'
import { setSession } from '../services/session'
import { getApiErrorMessage } from '../services/errors'
import '../styles/auth.css'

function Login() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  // Which login is running, so the buttons can't be pressed twice.
  const [submitting, setSubmitting] = useState<'email' | 'google' | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('') // clear error on type
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSubmitting('email')

    try {
      const data = await loginRequest(formData.email, formData.password)

      setSession(data.token, data.user)

      navigate('/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Login failed. Please check your credentials.'))
      setSubmitting(null)
    }
  }

  const handleGoogleLogin = async () => {
    setSubmitting('google')
    try {
      setError('')
      const result = await signInWithPopup(auth, provider)
      const firebaseToken = await result.user.getIdToken()
      const data = await googleLoginRequest(firebaseToken)

      setSession(data.token, data.user)

      navigate('/dashboard')
    } catch {
      setError('Google login failed. Please try again.')
      setSubmitting(null)
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

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

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

            <button type="submit" className="auth-btn" disabled={submitting !== null}>
              {submitting === 'email' ? 'Logging in…' : 'Log In'}
            </button>
          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <button className="google-btn" onClick={handleGoogleLogin} disabled={submitting !== null}>
            {submitting === 'google' ? 'Waiting for Google…' : 'Continue with Google'}
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
