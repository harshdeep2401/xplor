import { Routes, Route, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Editor2D from './pages/Editor2D'
import Editor3D from './pages/Editor'
import SystemStatus from './pages/SystemStatus'
import { ProtectedRoute, RedirectIfAuthenticated } from './components/routing/guards'

function App() {
  // A crash on one page shows the error screen; navigating clears it.
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
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
          path="/status"
          element={
            <ProtectedRoute>
              <SystemStatus />
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
    </ErrorBoundary>
  )
}

export default App
