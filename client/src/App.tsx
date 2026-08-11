import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Editor2D from './pages/Editor2D'
import Editor3D from './pages/Editor'
import { ProtectedRoute, RedirectIfAuthenticated } from './components/routing/guards'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthenticated>
            <Signup />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/editor/2d/:projectId"
        element={
          <ProtectedRoute>
            <Editor2D />
          </ProtectedRoute>
        }
      />
      <Route
        path="/editor/3d/:projectId"
        element={
          <ProtectedRoute>
            <Editor3D />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App