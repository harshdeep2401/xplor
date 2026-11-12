import { useState } from 'react'
import '../styles/auth.css'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { auth, provider } from '../firebase'
import { googleLoginRequest, registerRequest } from '../services/authService'
import { setSession } from '../services/session'
import { getApiErrorMessage } from '../services/errors'

function Signup() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    countryCode: '+91',
    phone: '',
    password: '',
    confirmPassword: '',
  })

  const [error, setError] = useState('')
  // Which sign-up is running, so the buttons can't be pressed twice.
  const [submitting, setSubmitting] = useState<'email' | 'google' | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setError('') // clear error on type
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    // Password Validation: At least 6 characters and 1 capital letter
    const passwordRegex = /^(?=.*[A-Z]).{6,}$/
    if (!passwordRegex.test(formData.password)) {
      setError(
        'Password must be at least 6 characters long and contain at least one capital letter.',
      )
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting('email')
    try {
      const data = await registerRequest({
        name: formData.name,
        email: formData.email,
        countryCode: formData.countryCode,
        phone: formData.phone,
        password: formData.password,
      })

      setSession(data.token, data.user)

      navigate('/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
      setSubmitting(null)
    }
  }

  const handleGoogleSignup = async () => {
    setSubmitting('google')
    try {
      setError('')
      const result = await signInWithPopup(auth, provider)

      const firebaseToken = await result.user.getIdToken()

      const data = await googleLoginRequest(firebaseToken)

      setSession(data.token, data.user)

      navigate('/dashboard')
    } catch (err) {
      // Server problems carry their own message; a closed popup falls back.
      setError(getApiErrorMessage(err, 'Google login failed. Please try again.'))
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
          <h2>Create Account</h2>
          <p>Join XPLOR and explore the future of AI</p>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              name="name"
              placeholder="Full Name"
              value={formData.name}
              onChange={handleChange}
              required
            />

            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <div className="phone-group">
              <select name="countryCode" value={formData.countryCode} onChange={handleChange}>
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+61">🇦🇺 +61</option>
                <option value="+971">🇦🇪 +971</option>
              </select>

              <input
                type="text"
                name="phone"
                placeholder="Phone Number"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
            />

            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />

            <button type="submit" className="auth-btn" disabled={submitting !== null}>
              {submitting === 'email' ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <button
            className="google-btn"
            onClick={handleGoogleSignup}
            disabled={submitting !== null}
          >
            {submitting === 'google' ? 'Waiting for Google…' : 'Continue with Google'}
          </button>

          <p className="auth-footer-text">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Signup
