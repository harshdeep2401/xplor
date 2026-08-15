import '../styles/hero.css'

function Hero() {
  return (
    <section className="hero">
      <div className="hero-left">
        <p className="hero-tag">AI Powered Startup Platform</p>

        <h1>
          Explore The <span>Future</span> <br />
          With XPLOR
        </h1>

        <p className="hero-description">
          Build, automate, and grow with the next generation AI startup platform.
          Experience futuristic tools, immersive dashboards, and powerful analytics.
        </p>

        <div className="hero-buttons">
          <button className="hero-btn-primary">Get Started</button>
          <button className="hero-btn-secondary">Learn More</button>
        </div>
      </div>

      <div className="hero-right">
        <div className="glow-circle glow-one"></div>
        <div className="glow-circle glow-two"></div>

        <div className="hero-card">
          <h3>AI Growth</h3>
          <p>Let's automate the business with smart AI workflows and VR walkthroghs.</p>
        </div>

        <div className="floating-orb"></div>
      </div>
    </section>
  )
}

export default Hero