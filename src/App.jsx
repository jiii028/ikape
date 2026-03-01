import { useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FarmProvider, useFarm } from './context/FarmContext'
import { setupSyncListeners, setAuthErrorCallback, setSyncCompleteCallback } from './lib/syncManager'
import { clearCachedByPrefix } from './lib/queryCache'
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
import AgriclimaticInputs from './admin/pages/AgriclimaticInputs'

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

// Component to handle sync events (auth errors and sync complete)
function SyncEventHandler({ children }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { fetchFarmData, removeClustersByClientIds } = useFarm();

  useEffect(() => {
    // Set up auth error callback for sync manager
    setAuthErrorCallback(async (error) => {
      console.error('Sync authentication error:', error);
      
      // Show alert to user
      alert('Your session has expired. Please log in again to sync your data.');
      
      // Log out and redirect to login
      await logout();
      navigate('/login', { replace: true });
    });

    // Set up sync complete callback to refresh farm data
    setSyncCompleteCallback(async (syncedClientIds) => {
      console.log('Sync completed - refreshing farm data', syncedClientIds);
      
      // IMPORTANT: First remove offline clusters from React state by their client IDs
      // This prevents duplication when fresh data is fetched
      if (syncedClientIds && syncedClientIds.length > 0) {
        console.log('Removing synced offline clusters from state:', syncedClientIds);
        removeClustersByClientIds(syncedClientIds);
      }
      
      // Clear the query cache to force fresh fetch from server
      clearCachedByPrefix('farm_context:');
      
      // Wait for React state update to complete, then fetch fresh data
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchFarmData(true); // forceRefresh = true to bypass cache
    });

    return () => {
      setAuthErrorCallback(null);
      setSyncCompleteCallback(null);
    };
  }, [navigate, logout, fetchFarmData, removeClustersByClientIds]);

  return children;
}

function App() {
  useEffect(() => {
    setupSyncListeners();
  }, []);

  return (
    <AuthProvider>
      <FarmProvider>
        <SyncEventHandler>
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
            <Route path="agriclimatic-inputs" element={<AgriclimaticInputs />} />
          </Route>

          {/* Catch-all: keep authenticated users in their dashboard, guests to login */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        </SyncEventHandler>
      </FarmProvider>
    </AuthProvider>
  )
}

export default App
