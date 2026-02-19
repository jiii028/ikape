import { Outlet, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFarm } from '../context/FarmContext'
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
  Layers,
  Scissors,
  FlaskConical,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog'
import './DashboardLayout.css'

const SIDEBAR_PREF_KEY = 'ikape_farmer_sidebar_collapsed'
const FARMER_MAIN_NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/harvest', icon: BarChart3, label: 'Harvest Records' },
  { path: '/recommendations', icon: Lightbulb, label: 'Recommendations' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const { farm, clusters } = useFarm()
  const navigate = useNavigate()
  const location = useLocation()
  const { clusterId } = useParams()
  const isClusterRoute = location.pathname.startsWith('/clusters/')
  const searchContainerRef = useRef(null)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
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

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!searchContainerRef.current) return
      if (searchContainerRef.current.contains(event.target)) return
      setIsSearchOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const clusterNavItems = clusterId
    ? [
        { path: `/clusters/${clusterId}/overview`, icon: ClipboardList, label: 'Overview' },
        { path: `/clusters/${clusterId}/harvest`, icon: BarChart3, label: 'Harvest' },
        { path: `/clusters/${clusterId}/pruning`, icon: Scissors, label: 'Pruning' },
        { path: `/clusters/${clusterId}/fertilize`, icon: FlaskConical, label: 'Fertilize' },
        { path: `/clusters/${clusterId}/pesticide`, icon: ShieldAlert, label: 'Pesticide' },
      ]
    : []

  const navItems = isClusterRoute ? clusterNavItems : FARMER_MAIN_NAV_ITEMS
  const mobileNavItems = FARMER_MAIN_NAV_ITEMS
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const searchResults = useMemo(() => {
    if (!normalizedSearch) return []

    const pageResults = FARMER_MAIN_NAV_ITEMS
      .filter((item) => item.label.toLowerCase().includes(normalizedSearch))
      .map((item) => ({
        id: `page-${item.path}`,
        type: 'page',
        label: item.label,
        detail: 'Navigate to page',
        icon: item.icon,
        path: item.path,
      }))

    const clusterResults = clusters
      .filter((cluster) => {
        const stage = cluster.plantStage || ''
        return (
          (cluster.clusterName || '').toLowerCase().includes(normalizedSearch) ||
          stage.toLowerCase().includes(normalizedSearch)
        )
      })
      .map((cluster) => ({
        id: `cluster-${cluster.id}`,
        type: 'cluster',
        label: cluster.clusterName,
        detail: `${cluster.plantStage || 'Unknown stage'} cluster`,
        icon: Layers,
        path: `/clusters/${cluster.id}/overview`,
      }))

    const farmResults =
      farm?.farm_name && farm.farm_name.toLowerCase().includes(normalizedSearch)
        ? [
            {
              id: `farm-${farm.id || 'current'}`,
              type: 'farm',
              label: farm.farm_name,
              detail: 'Farm overview',
              icon: LayoutDashboard,
              path: '/dashboard',
            },
          ]
        : []

    return [...pageResults, ...farmResults, ...clusterResults].slice(0, 8)
  }, [clusters, farm, normalizedSearch])

  const handleSearchNavigate = (result) => {
    setIsSearchOpen(false)
    setSearchQuery('')
    navigate(result.path)
  }

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsSearchOpen(false)
      return
    }

    if (event.key === 'Enter' && searchResults.length > 0) {
      event.preventDefault()
      handleSearchNavigate(searchResults[0])
    }
  }

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
          <div className="search-bar" ref={searchContainerRef}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search pages and clusters..."
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setIsSearchOpen(true)
              }}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setSearchQuery('')
                  setIsSearchOpen(false)
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
            {isSearchOpen && (
              <div className="search-results">
                {searchResults.length === 0 ? (
                  <div className="search-empty">No matches found</div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="search-result-item"
                      onClick={() => handleSearchNavigate(result)}
                    >
                      <result.icon size={16} />
                      <div className="search-result-content">
                        <span className="search-result-title">{result.label}</span>
                        <span className="search-result-subtitle">{result.detail}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="topbar-right">
            <button className="topbar-icon-btn">
              <Bell size={20} />
            </button>
            <button className="topbar-icon-btn mobile-logout-btn" onClick={() => setLogoutConfirm(true)}>
              <LogOut size={18} />
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

      <nav className="mobile-nav">
        {mobileNavItems.map((item) => (
          <NavLink
            key={`mobile-${item.path}`}
            to={item.path}
            className={({ isActive }) =>
              `mobile-nav-item ${isActive ? 'mobile-nav-item--active' : ''}`
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      
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
