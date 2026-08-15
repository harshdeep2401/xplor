import { FaInstagram, FaLinkedin, FaEnvelope, FaPhone, FaMapMarkerAlt } from 'react-icons/fa'
import '../styles/footer.css'

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <h2>XPLOR</h2>
          <p>
            Building futuristic AI experiences with immersive design,
            smart automation, and powerful technology.
          </p>
        </div>

        <div className="footer-links">
          <h3>Quick Links</h3>
          <a href="#">Home</a>
          <a href="#">Features</a>
          <a href="#">About</a>
          <a href="#">Contact</a>
        </div>

        <div className="footer-contact">
          <h3>Contact</h3>
          <p><FaEnvelope /> hello@xplor.ai</p>
          <p><FaPhone /> +91 98765 43210</p>
          <p><FaMapMarkerAlt /> Punjab, India</p>
        </div>

        <div className="footer-socials">
          <h3>Socials</h3>

          <div className="social-icons">
            <a href="#">
              <FaInstagram />
            </a>

            <a href="#">
              <FaLinkedin />
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© 2026 XPLOR. All Rights Reserved.</p>
      </div>
    </footer>
  )
}

export default Footer