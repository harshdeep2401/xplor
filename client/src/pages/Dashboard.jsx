import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { auth } from '../firebase'
import apiClient from '../services/apiClient'
import { getUser, clearSession } from '../services/session'
import '../styles/dashboard.css'

function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isModal3DOpen, setIsModal3DOpen] = useState(false)
  const [projectName, setProjectName] = useState('Untitled Floor Plan')
  const [canvasWidth, setCanvasWidth] = useState(2000)
  const [canvasHeight, setCanvasHeight] = useState(2000)
  const [gridWidth, setGridWidth] = useState(10)
  const [gridLength, setGridLength] = useState(10)
  const [gridHeight, setGridHeight] = useState(2.8)
  const [isCreating, setIsCreating] = useState(false)
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Auth is already guaranteed by ProtectedRoute; just hydrate the user.
    const currentUser = getUser()
    if (!currentUser) {
      navigate('/login')
      return
    }
    setUser(currentUser)

    // Fetch user projects (apiClient attaches the token and handles 401)
    const fetchProjects = async () => {
      try {
        const { data } = await apiClient.get('/projects')
        setProjects(data.projects || [])
      } catch (error) {
        console.error('Error fetching projects:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProjects()
  }, [navigate])

  const handleLogout = () => {
    clearSession()
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

  const handleCreateProject = async () => {
    setIsCreating(true)
    try {
      const { data } = await apiClient.post('/projects', {
        name: projectName,
        canvasWidth: Number(canvasWidth),
        canvasHeight: Number(canvasHeight),
        type: '2d',
      })
      navigate(`/editor/2d/${data.project._id}`)
    } catch (error) {
      console.error('Error creating project:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateProject3D = async () => {
    setIsCreating(true)
    try {
      const { data } = await apiClient.post('/projects', {
        name: projectName,
        canvasWidth: Number(gridWidth),
        canvasHeight: Number(gridLength),
        type: '3d',
      })
      navigate(`/editor/3d/${data.project._id}`, {
        state: {
          gridWidth: Number(gridWidth),
          gridLength: Number(gridLength),
          height: Number(gridHeight),
        },
      })
    } catch (error) {
      console.error('Error creating 3D project:', error)
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
          <div className="action-card action-card-3d" onClick={() => setIsModal3DOpen(true)}>
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
          {isLoading ? (
            <p>Loading projects...</p>
          ) : projects.length === 0 ? (
            <p>No projects yet. Create one to get started!</p>
          ) : (
            <div className="projects-grid">
              {projects.map((project, index) => {
                const gradient = `gradient-${(index % 3) + 1}`
                const is3D = project.type === '3d'
                const dateString = new Date(project.updatedAt).toLocaleDateString()
                return (
                  <div 
                    key={project._id || project.id} 
                    className="project-card"
                    onClick={() => navigate(`/editor/${is3D ? '3d' : '2d'}/${project._id || project.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={`project-thumbnail ${gradient}`}>
                      {is3D ? '🧊' : '📐'}
                    </div>
                    <div className="project-info">
                      <h4>{project.name}</h4>
                      <p>
                        <span>{is3D ? '3D Project' : '2D Project'}</span>
                        <span>{dateString}</span>
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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

      {/* Create 3D Project Modal */}
      {isModal3DOpen && (
        <div className="create-project-modal-overlay">
          <div className="create-project-modal">
            <h2>Create New 3D Environment</h2>
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
                <label>Grid Width</label>
                <input 
                  type="number" 
                  value={gridWidth} 
                  onChange={e => setGridWidth(e.target.value)} 
                />
              </div>
              <div className="modal-field">
                <label>Grid Length</label>
                <input 
                  type="number" 
                  value={gridLength} 
                  onChange={e => setGridLength(e.target.value)} 
                />
              </div>
            </div>
            <div className="modal-field">
              <label>Wall Height</label>
              <input 
                type="number" 
                value={gridHeight} 
                onChange={e => setGridHeight(e.target.value)} 
              />
            </div>
            <div className="modal-actions">
              <button 
                className="modal-cancel-btn" 
                onClick={() => setIsModal3DOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button 
                className="modal-create-btn" 
                onClick={handleCreateProject3D}
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