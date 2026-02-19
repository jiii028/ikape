import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FarmProvider } from './context/FarmContext'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'
import ResetPassword from './pages/ResetPassword/ResetPassword'
import DashboardLayout from './layouts/DashboardLayout'
import Dashboard from './pages/Dashboard/Dashboard'
import HarvestRecords from './pages/HarvestRecords/HarvestRecords'
import Recommendations from './pages/Recommendations/Recommendations'
import Settings from './pages/Settings/Settings'
import ClusterDetail from './pages/ClusterDetail/ClusterDetail'
import LoadingScreen from './components/LoadingScreen'

// Admin imports
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/pages/AdminDashboard'
import RegisteredFarmers from './admin/pages/RegisteredFarmers'
import Prediction from './admin/pages/Prediction'

// ===== STRICT ROUTE GUARDS =====

// Farmer-only routes: must be logged in AND role === 'farmer'
function FarmerRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen message="Loading your farm..." />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'farmer') {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
  }
  return children
}

// Admin-only routes: must be logged in AND role === 'admin'
function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen message="Loading admin panel..." />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') {
    return <Navigate to={user.role === 'farmer' ? '/dashboard' : '/admin/dashboard'} replace />
  }
  return children
}

// Guest routes: only accessible if NOT logged in
function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen message="Checking your session..." />
  if (user) {
    // Redirect to correct dashboard based on DB role
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
  }
  return children
}

// Root "/" handler: redirects based on role or to login
function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen message="Welcome to IKAPE..." />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
}

function App() {
  return (
    <AuthProvider>
      <FarmProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Root redirects based on role */}
          <Route path="/" element={<HomeRedirect />} />

          {/* Farmer Routes — STRICTLY role === 'farmer' */}
          <Route element={<FarmerRoute><DashboardLayout /></FarmerRoute>}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="clusters/:clusterId/:section?" element={<ClusterDetail />} />
            <Route path="harvest" element={<HarvestRecords />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Admin Routes — STRICTLY role === 'admin' */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="farmers" element={<RegisteredFarmers />} />
            <Route path="prediction" element={<Prediction />} />
          </Route>

          {/* Catch-all: keep authenticated users in their dashboard, guests to login */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </FarmProvider>
    </AuthProvider>
  )
}

export default App
