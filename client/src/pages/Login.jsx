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

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const data = await loginRequest(formData.email, formData.password)

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      navigate('/dashboard')
    } catch (error) {
      console.log(error)
      alert(error.response?.data?.message || 'Login failed')
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseToken = await result.user.getIdToken()
      const data = await googleLoginRequest(firebaseToken)

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      navigate('/dashboard')
    } catch (error) {
      console.log(error)
      alert('Google login failed')
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