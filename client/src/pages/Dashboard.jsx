import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { auth } from '../firebase'
import '../styles/dashboard.css'

function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [projectName, setProjectName] = useState('Untitled Floor Plan')
  const [canvasWidth, setCanvasWidth] = useState(2000)
  const [canvasHeight, setCanvasHeight] = useState(2000)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      navigate('/login')
      return
    }

    setUser(JSON.parse(userData))
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    auth.signOut()
    navigate('/')
  }

  // Get first letter for avatar
  const getInitial = () => {
    if (user && user.name) {
      return user.name.charAt(0).toUpperCase()
    }
    return 'X'
  }

  const getFirstName = () => {
    if (user && user.name) {
      return user.name.split(' ')[0]
    }
    return 'Explorer'
  }

  // Mock Recent Works Data
  const recentProjects = [
    { id: 1, name: 'Modern Villa 3D Walkthrough', type: '3D Project', date: '2 hours ago', gradient: 'gradient-1' },
    { id: 2, name: 'Office Floor Plan', type: '2D Project', date: 'Yesterday', gradient: 'gradient-2' },
    { id: 3, name: 'Minimalist Apartment VR', type: '3D Project', date: '3 days ago', gradient: 'gradient-3' },
  ]

  const handleCreateProject = async () => {
    setIsCreating(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:5001/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` // if needed
        },
        body: JSON.stringify({
          name: projectName,
          canvasWidth: Number(canvasWidth),
          canvasHeight: Number(canvasHeight),
          type: '2d',
          userId: user.id
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        navigate(`/editor/${data.project._id}`)
      } else {
        console.error('Failed to create project:', data.message)
      }
    } catch (error) {
      console.error('Error creating project:', error)
    } finally {
      setIsCreating(false)
    }
  }

  if (!user) return null

  return (
    <div className="dashboard-page">
      {/* Header */}
      <header className="dashboard-header">
        <Link to="/" className="dashboard-logo">XPLOR</Link>
        <div className="dashboard-user-info">
          <div className="dashboard-user-avatar">{getInitial()}</div>
          <button className="dashboard-logout" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-content">
        
        {/* Welcome Section */}
        <div className="dashboard-welcome">
          <h1>Welcome back, {getFirstName()}!</h1>
          <p>Ready to build the future? Start a new project or continue your recent work.</p>
        </div>

        {/* Primary Actions */}
        <div className="dashboard-actions">
          <div className="action-card action-card-3d">
            <div className="action-icon icon-3d">
              <span>🧊</span>
            </div>
            <h3>Create New 3D Project</h3>
            <p>Design immersive 3D environments and VR walkthroughs.</p>
          </div>

          <div className="action-card action-card-2d" onClick={() => setIsModalOpen(true)}>
            <div className="action-icon icon-2d">
              <span>📐</span>
            </div>
            <h3>Create New 2D Project</h3>
            <p>Draft smart, precise 2D floor plans and architectural layouts.</p>
          </div>
        </div>

        {/* Recent Works */}
        <div className="dashboard-recent-works">
          <h2 className="recent-works-header">Recent Works</h2>
          <div className="projects-grid">
            {recentProjects.map(project => (
              <div key={project.id} className="project-card">
                <div className={`project-thumbnail ${project.gradient}`}>
                  {project.type === '3D Project' ? '🧊' : '📐'}
                </div>
                <div className="project-info">
                  <h4>{project.name}</h4>
                  <p>
                    <span>{project.type}</span>
                    <span>{project.date}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>&copy; {new Date().getFullYear()} XPLOR AI Startup Platform. All rights reserved.</p>
      </footer>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="create-project-modal-overlay">
          <div className="create-project-modal">
            <h2>Create New 2D Floor Plan</h2>
            <div className="modal-field">
              <label>Project Name</label>
              <input 
                type="text" 
                value={projectName} 
                onChange={e => setProjectName(e.target.value)} 
              />
            </div>
            <div className="modal-row">
              <div className="modal-field">
                <label>Canvas Width</label>
                <input 
                  type="number" 
                  value={canvasWidth} 
                  onChange={e => setCanvasWidth(e.target.value)} 
                />
              </div>
              <div className="modal-field">
                <label>Canvas Height</label>
                <input 
                  type="number" 
                  value={canvasHeight} 
                  onChange={e => setCanvasHeight(e.target.value)} 
                />
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="modal-cancel-btn" 
                onClick={() => setIsModalOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button 
                className="modal-create-btn" 
                onClick={handleCreateProject}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard