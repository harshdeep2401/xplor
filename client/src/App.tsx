import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import PageLoader from './components/PageLoader'
import Home from './pages/Home'
import { ProtectedRoute, RedirectIfAuthenticated } from './components/routing/guards'

// The landing page loads with the app; every other page is downloaded the
// first time it's opened, so visitors don't pay for the editors (three.js,
// Konva) or Firebase up front.
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Editor2D = lazy(() => import('./pages/Editor2D'))
const Editor3D = lazy(() => import('./pages/Editor'))
const SystemStatus = lazy(() => import('./pages/SystemStatus'))

function App() {
  // A crash on one page shows the error screen; navigating clears it.
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
