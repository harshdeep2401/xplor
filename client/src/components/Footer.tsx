import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import '../styles/footer.css'

function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="footer-top">
        <div className="footer-brand">
          <h2>XPLOR</h2>
          <p>
            Building futuristic AI experiences with immersive design, smart automation, and powerful
            technology.
          </p>
        </div>

        <div className="footer-links">
          <h3>Quick Links</h3>
          <a href="#top">Home</a>
          <a href="#features">Features</a>
          <Link to="/signup">Get Started</Link>
          <Link to="/login">Log In</Link>
        </div>

        <div className="footer-contact">
          <h3>Contact</h3>
          <p>
            <Mail size="1em" aria-hidden="true" /> hello@xplor.ai
          </p>
          <p>
            <Phone size="1em" aria-hidden="true" /> +91 98765 43210
          </p>
          <p>
            <MapPin size="1em" aria-hidden="true" /> Punjab, India
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© 2026 XPLOR. All Rights Reserved.</p>
      </div>
    </footer>
  )
}

export default Footer
