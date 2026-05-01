import { Link } from 'react-router-dom'
import '../styles/navbar.css'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        XPLOR
      </div>

      <div className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/">About</Link>
        <Link to="/">Features</Link>
        <Link to="/">Contact</Link>
      </div>

      <div className="navbar-buttons">
        <Link to="/login">
          <button className="login-btn">Login</button>
        </Link>

        <Link to="/signup">
          <button className="signup-btn">Sign Up</button>
        </Link>
      </div>
    </nav>
  )
}

export default Navbar