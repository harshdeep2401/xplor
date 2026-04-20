import { useState } from 'react'
import '../styles/auth.css'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { auth, provider } from '../firebase'
import { googleLoginRequest, registerRequest } from '../services/authService'
import AuthVisual from '../components/AuthVisual'

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

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    try {
      const data = await registerRequest({
        name: formData.name,
        email: formData.email,
        countryCode: formData.countryCode,
        phone: formData.phone,
        password: formData.password,
      })

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      navigate('/dashboard')
    } catch (error) {
      console.log(error)
      alert(error.response?.data?.message || 'Something went wrong')
    }
  }

  const handleGoogleSignup = async () => {
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
      <div className="auth-form-container">
        <div className="auth-card">
          <h2>Create Account</h2>
          <p>Join XPLOR and explore the future of AI</p>

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
              <select
                name="countryCode"
                value={formData.countryCode}
                onChange={handleChange}
              >
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

            <button type="submit" className="auth-btn">
              Create Account
            </button>
          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <button className="google-btn" onClick={handleGoogleSignup}>
            Continue with Google
          </button>
          
          <p className="auth-footer-text">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
      
      <AuthVisual />
    </div>
  )
}

export default Signup