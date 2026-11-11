import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Box, ImageUp, LoaderCircle, PencilRuler } from 'lucide-react'
import { auth } from '../firebase'
import apiClient from '../services/apiClient'
import { getApiErrorMessage } from '../services/errors'
import { toast } from '../components/toast/toast'
import Button, { buttonClass } from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { getUser, clearSession } from '../services/session'
import type { SessionUser } from '../services/session'
import type { Project, FloorPlanUploadResponse, ImportResult } from '../types/api'
import '../styles/dashboard.css'

function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isModal3DOpen, setIsModal3DOpen] = useState(false)
  const [projectName, setProjectName] = useState('Untitled Floor Plan')
  const [canvasWidth, setCanvasWidth] = useState(2000)
  const [canvasHeight, setCanvasHeight] = useState(2000)
  const [gridWidth, setGridWidth] = useState(10)
  const [gridLength, setGridLength] = useState(10)
  const [gridHeight, setGridHeight] = useState(2.8)
  const [isCreating, setIsCreating] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
        const { data } = await apiClient.get<{ projects: Project[] }>('/projects')
        setProjects(data.projects || [])
      } catch (error) {
        const message = getApiErrorMessage(error, 'Could not load your projects.')
        setLoadError(message)
        toast.error(message)
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
      const { data } = await apiClient.post<{ project: Project }>('/projects', {
        name: projectName,
        canvasWidth: Number(canvasWidth),
        canvasHeight: Number(canvasHeight),
        type: '2d',
      })
      navigate(`/editor/2d/${data.project._id}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not create the project. Please try again.'))
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateProject3D = async () => {
    setIsCreating(true)
    try {
      const { data } = await apiClient.post<{ project: Project }>('/projects', {
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
      toast.error(getApiErrorMessage(error, 'Could not create the project. Please try again.'))
    } finally {
      setIsCreating(false)
    }
  }

  // Path B: create a 2D project, upload the plan image, and open the editor. The
  // server runs detection synchronously, so the response already carries the
  // finished job. A failed detection still opens the editor: the image is
  // stored, so the user can trace it by hand.
  const handleImportFloorPlan = async () => {
    if (!importFile) {
      setImportError('Choose a floor-plan image first.')
      return
    }
    setIsCreating(true)
    setImportError(null)
    let projectId: string | null = null
    try {
      const { data: created } = await apiClient.post<{ project: Project }>('/projects', {
        name: projectName,
        type: '2d',
      })
      projectId = created.project._id || created.project.id

      const form = new FormData()
      form.append('floorPlan', importFile)
      const { data } = await apiClient.post<FloorPlanUploadResponse>(
        `/projects/${projectId}/upload-floor-plan`,
        form,
      )

      const importResult: ImportResult =
        data.job.status === 'completed'
          ? { status: 'completed', wallCount: data.job.metadata?.wallCount ?? 0 }
          : { status: 'failed', error: data.job.errorMessage || 'Detection failed' }
      navigate(`/editor/2d/${projectId}`, { state: { importResult } })
    } catch (error) {
      // The upload itself was rejected (bad file type, too large…): don't leave
      // an empty project behind.
      if (projectId) {
        await apiClient.delete(`/projects/${projectId}`).catch(() => {})
      }
      setImportError(getApiErrorMessage(error, 'Upload failed. Please try again.'))
    } finally {
      setIsCreating(false)
    }
  }

  const closeImport = () => {
    setIsImportOpen(false)
    setImportFile(null)
    setImportError(null)
  }

  if (!user) return null

  return (
    <div className="dashboard-page">
      {/* Header */}
      <header className="dashboard-header">
        <Link to="/" className="dashboard-logo">XPLOR</Link>
        <div className="dashboard-user-info">
          <Link to="/status" className={buttonClass('ghost', 'sm')}>System status</Link>
          <div className="dashboard-user-avatar">{getInitial()}</div>
          <Button size="sm" onClick={handleLogout}>Log Out</Button>
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
              <Box aria-hidden="true" />
            </div>
            <h3>Create New 3D Project</h3>
            <p>Design immersive 3D environments and VR walkthroughs.</p>
          </div>

          <div className="action-card action-card-2d" onClick={() => setIsModalOpen(true)}>
            <div className="action-icon icon-2d">
              <PencilRuler aria-hidden="true" />
            </div>
            <h3>Create New 2D Project</h3>
            <p>Draft smart, precise 2D floor plans and architectural layouts.</p>
          </div>

          <div className="action-card action-card-import" onClick={() => setIsImportOpen(true)}>
            <div className="action-icon icon-import">
              <ImageUp aria-hidden="true" />
            </div>
            <h3>Import Floor Plan</h3>
            <p>Upload a floor-plan image and we'll detect the walls for you.</p>
          </div>
        </div>

        {/* Recent Works */}
        <div className="dashboard-recent-works">
          <h2 className="recent-works-header">Recent Works</h2>
          {isLoading ? (
            <p className="dashboard-state">
              <LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /> Loading projects…
            </p>
          ) : loadError ? (
            <p className="dashboard-state dashboard-state-error">{loadError}</p>
          ) : projects.length === 0 ? (
            <p className="dashboard-state">No projects yet. Create one above to get started.</p>
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
                      {is3D ? <Box size={40} aria-hidden="true" /> : <PencilRuler size={40} aria-hidden="true" />}
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
      <Modal
        open={isModalOpen}
        title="Create New 2D Floor Plan"
        onClose={() => setIsModalOpen(false)}
        busy={isCreating}
        footer={
          <>
            <Button onClick={() => setIsModalOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateProject} loading={isCreating}>
              {isCreating ? 'Creating…' : 'Create Project'}
            </Button>
          </>
        }
      >
        <Field label="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Canvas width (px)"
            type="number"
            value={canvasWidth}
            onChange={e => setCanvasWidth(Number(e.target.value))}
          />
          <Field
            label="Canvas height (px)"
            type="number"
            value={canvasHeight}
            onChange={e => setCanvasHeight(Number(e.target.value))}
          />
        </div>
      </Modal>

      {/* Import Floor Plan Modal */}
      <Modal
        open={isImportOpen}
        title="Import Floor Plan"
        onClose={closeImport}
        busy={isCreating}
        footer={
          <>
            <Button onClick={closeImport} disabled={isCreating}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleImportFloorPlan}
              loading={isCreating}
              disabled={!importFile}
            >
              {isCreating ? 'Importing…' : 'Import'}
            </Button>
          </>
        }
      >
        <Field label="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} />
        <Field
          label="Floor-plan image"
          hint="PNG, JPG or WEBP, up to 15 MB."
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={e => {
            setImportFile(e.target.files?.[0] ?? null)
            setImportError(null)
          }}
        />
        {importError && <p className="text-sm text-danger" role="alert">{importError}</p>}
        {isCreating && <p className="text-sm text-muted">Detecting walls… this can take up to 30 seconds.</p>}
      </Modal>

      {/* Create 3D Project Modal */}
      <Modal
        open={isModal3DOpen}
        title="Create New 3D Environment"
        onClose={() => setIsModal3DOpen(false)}
        busy={isCreating}
        footer={
          <>
            <Button onClick={() => setIsModal3DOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateProject3D} loading={isCreating}>
              {isCreating ? 'Creating…' : 'Create Project'}
            </Button>
          </>
        }
      >
        <Field label="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Room width (m)"
            type="number"
            value={gridWidth}
            onChange={e => setGridWidth(Number(e.target.value))}
          />
          <Field
            label="Room length (m)"
            type="number"
            value={gridLength}
            onChange={e => setGridLength(Number(e.target.value))}
          />
        </div>
        <Field
          label="Wall height (m)"
          type="number"
          step={0.1}
          value={gridHeight}
          onChange={e => setGridHeight(Number(e.target.value))}
        />
      </Modal>
    </div>
  )
}

export default Dashboard