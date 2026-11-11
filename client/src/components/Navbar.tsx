import { Link } from 'react-router-dom'
import '../styles/navbar.css'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-logo">XPLOR</div>

      {/* In-page links to sections of the home page (pages/Home.tsx). */}
      <div className="navbar-links">
        <a href="#top">Home</a>
        <a href="#features">Features</a>
        <a href="#contact">Contact</a>
      </div>

      <div className="navbar-buttons">
        <Link to="/login" className="login-btn">
          Login
        </Link>
        <Link to="/signup" className="signup-btn">
          Sign Up
        </Link>
      </div>
    </nav>
  )
}

export default Navbar
