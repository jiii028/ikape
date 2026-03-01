import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FarmProvider } from './context/FarmContext'
import LoadingScreen from './components/LoadingScreen'

const Login = lazy(() => import('./pages/Login/Login'))
const Register = lazy(() => import('./pages/Register/Register'))
const ResetPassword = lazy(() => import('./pages/ResetPassword/ResetPassword'))
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const HarvestRecords = lazy(() => import('./pages/HarvestRecords/HarvestRecords'))
const Recommendations = lazy(() => import('./pages/Recommendations/Recommendations'))
const Settings = lazy(() => import('./pages/Settings/Settings'))
const ClusterDetail = lazy(() => import('./pages/ClusterDetail/ClusterDetail'))
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./admin/pages/AdminDashboard'))
const RegisteredFarmers = lazy(() => import('./admin/pages/RegisteredFarmers'))
const Prediction = lazy(() => import('./admin/pages/Prediction'))
const AgriclimaticSettings = lazy(() => import('./admin/pages/AgriclimaticSettings'))

function withSuspense(node, message = 'Loading...') {
  return <Suspense fallback={<LoadingScreen message={message} />}>{node}</Suspense>
}

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
          <Route
            path="/login"
            element={<GuestRoute>{withSuspense(<Login />, 'Loading sign in...')}</GuestRoute>}
          />
          <Route
            path="/register"
            element={<GuestRoute>{withSuspense(<Register />, 'Loading registration...')}</GuestRoute>}
          />
          <Route path="/reset-password" element={withSuspense(<ResetPassword />, 'Loading reset page...')} />

          {/* Root redirects based on role */}
          <Route path="/" element={<HomeRedirect />} />

          {/* Farmer Routes - STRICTLY role === 'farmer' */}
          <Route element={<FarmerRoute>{withSuspense(<DashboardLayout />, 'Loading farm workspace...')}</FarmerRoute>}>
            <Route path="dashboard" element={withSuspense(<Dashboard />, 'Loading dashboard...')} />
            <Route path="clusters/:clusterId/:section?" element={withSuspense(<ClusterDetail />, 'Loading cluster details...')} />
            <Route path="harvest" element={withSuspense(<HarvestRecords />, 'Loading harvest records...')} />
            <Route path="recommendations" element={withSuspense(<Recommendations />, 'Loading recommendations...')} />
            <Route path="settings" element={withSuspense(<Settings />, 'Loading settings...')} />
          </Route>

          {/* Admin Routes - STRICTLY role === 'admin' */}
          <Route path="/admin" element={<AdminRoute>{withSuspense(<AdminLayout />, 'Loading admin workspace...')}</AdminRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={withSuspense(<AdminDashboard />, 'Loading admin dashboard...')} />
            <Route path="farmers" element={withSuspense(<RegisteredFarmers />, 'Loading farmers...')} />
            <Route path="prediction" element={withSuspense(<Prediction />, 'Loading prediction page...')} />
            <Route path="agriclimatic" element={withSuspense(<AgriclimaticSettings />, 'Loading agriclimatic settings...')} />
          </Route>

          {/* Catch-all: keep authenticated users in their dashboard, guests to login */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </FarmProvider>
    </AuthProvider>
  )
}

export default App
