// Route guards driven by the session utility.
//   ProtectedRoute            — only renders children when authenticated,
//                               otherwise sends the user to /login.
//   RedirectIfAuthenticated   — keeps already-logged-in users out of the
//                               login/signup pages by forwarding them to the
//                               dashboard (this is what removes the "have to
//                               sign in again every time" friction).
import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '../../services/session'

export function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />
}

export function RedirectIfAuthenticated({ children }) {
  return isAuthenticated() ? <Navigate to="/dashboard" replace /> : children
}
