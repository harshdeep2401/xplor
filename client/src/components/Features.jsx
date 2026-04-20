import '../styles/features.css'

function Features() {
  return (
    <section className="features-section">
      <div className="features-header">
        <p>Why Choose XPLOR</p>
        <h2>Powerful Features For Future Businesses</h2>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">01</div>
          <h3>AI Automation</h3>
          <p>
            Automate tasks, workflows, customer support, and operations
            with powerful AI systems.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">02</div>
          <h3>Analytics Dashboard</h3>
          <p>
            Track user growth, engagement, performance, and advanced
            business insights in real time.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">03</div>
          <h3>3D Experience</h3>
          <p>
            Enjoy futuristic visuals, glowing gradients, immersive
            animations, and smooth interactions.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">04</div>
          <h3>Cloud Security</h3>
          <p>
            Keep your business data safe with encrypted cloud storage
            and secure authentication systems.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">05</div>
          <h3>Team Collaboration</h3>
          <p>
            Manage teams, projects, and workflows together in one
            modern AI-powered workspace.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">06</div>
          <h3>Smart Insights</h3>
          <p>
            Use predictive analytics and AI-generated reports to make
            faster and better business decisions.
          </p>
        </div>
      </div>
    </section>
  )
}

export default Features