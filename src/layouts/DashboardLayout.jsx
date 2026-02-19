import { Outlet, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog'
import './DashboardLayout.css'

const SIDEBAR_PREF_KEY = 'ikape_farmer_sidebar_collapsed'

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { clusterId } = useParams()
  const isClusterRoute = location.pathname.startsWith('/clusters/')
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PREF_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, String(isSidebarCollapsed))
    } catch {
      // Ignore storage write errors in restricted browser contexts.
    }
  }, [isSidebarCollapsed])

  useEffect(() => {
    const handleKeyToggle = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return

      const target = event.target
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (isTypingTarget) return
      event.preventDefault()
      setIsSidebarCollapsed((prev) => !prev)
    }

    window.addEventListener('keydown', handleKeyToggle)
    return () => window.removeEventListener('keydown', handleKeyToggle)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
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
      <aside className={`sidebar ${isSidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
        <div className="sidebar-header">
          <Sprout size={28} className="sidebar-logo-icon" />
          <span className="sidebar-title">IKAPE</span>
          <button
            type="button"
            className={`sidebar-toggle ${isSidebarCollapsed ? 'sidebar-toggle--collapsed' : ''}`}
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isSidebarCollapsed}
            title={isSidebarCollapsed ? 'Show labels (Ctrl+B)' : 'Hide labels (Ctrl+B)'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight size={16} className="sidebar-toggle-icon" />
            ) : (
              <ChevronLeft size={16} className="sidebar-toggle-icon" />
            )}
          </button>
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

      <main className={`main-content ${isSidebarCollapsed ? 'main-content--expanded' : ''}`}>
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
                  {user?.municipality && user?.province
                    ? `${user.municipality}, ${user.province}`
                    : user?.municipality || user?.province || ''}
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
