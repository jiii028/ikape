import { Outlet, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard,
  BarChart3,
  Lightbulb,
  Settings,
  LogOut,
  Sprout,
  Search,
  Bell,
  User,
  ClipboardList,
  Scissors,
  FlaskConical,
  ShieldAlert,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog'
import './DashboardLayout.css'

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { clusterId } = useParams()
  const isClusterRoute = location.pathname.startsWith('/clusters/')
  const [logoutConfirm, setLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const appNavItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/harvest', icon: BarChart3, label: 'Harvest Records' },
    { path: '/recommendations', icon: Lightbulb, label: 'Recommendations' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  const clusterNavItems = clusterId
    ? [
        { path: `/clusters/${clusterId}/overview`, icon: ClipboardList, label: 'Overview' },
        { path: `/clusters/${clusterId}/harvest`, icon: BarChart3, label: 'Harvest' },
        { path: `/clusters/${clusterId}/pruning`, icon: Scissors, label: 'Pruning' },
        { path: `/clusters/${clusterId}/fertilize`, icon: FlaskConical, label: 'Fertilize' },
        { path: `/clusters/${clusterId}/pesticide`, icon: ShieldAlert, label: 'Pesticide' },
      ]
    : []

  const navItems = isClusterRoute ? clusterNavItems : appNavItems

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Sprout size={28} className="sidebar-logo-icon" />
          <span className="sidebar-title">IKAPE</span>
        </div>

        <nav className="sidebar-nav">
          {isClusterRoute && (
            <button className="nav-item nav-item--back" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard size={20} />
              <span>Back to Dashboard</span>
            </button>
          )}
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item--active' : ''}`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={() => setLogoutConfirm(true)}>
            <LogOut size={20} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search farm, cluster..." />
          </div>
          <div className="topbar-right">
            <button className="topbar-icon-btn">
              <Bell size={20} />
            </button>
            <div className="user-info">
              <div className="user-avatar">
                <User size={18} />
              </div>
              <div className="user-details">
                <span className="user-name">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="user-location">
                  {user?.municipality}, {user?.province}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
      
      <ConfirmDialog
        isOpen={logoutConfirm}
        onClose={() => setLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Confirm Logout"
        message="Are you sure you want to log out? You will need to log in again to access your account."
        confirmText="Log Out"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  )
}
