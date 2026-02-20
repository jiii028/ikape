import { Outlet, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFarm } from '../context/FarmContext'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard,
  BarChart3,
  Lightbulb,
  Settings,
  LogOut,
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
  ChevronDown,
  X,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog'
import './DashboardLayout.css'

const SIDEBAR_PREF_KEY = 'ikape_farmer_sidebar_collapsed'
const NOTIFICATION_VIEWED_KEY_PREFIX = 'ikape_farmer_notifications_viewed'
const NOTIFICATION_CLEARED_KEY_PREFIX = 'ikape_farmer_notifications_cleared'
const FARMER_MAIN_NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/harvest', icon: BarChart3, label: 'Harvest Records' },
  { path: '/recommendations', icon: Lightbulb, label: 'Recommendations' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function DashboardLayout() {
  const { user, authUser, logout } = useAuth()
  const { farm, clusters } = useFarm()
  const navigate = useNavigate()
  const location = useLocation()
  const { clusterId } = useParams()
  const isClusterRoute = location.pathname.startsWith('/clusters/')
  const searchContainerRef = useRef(null)
  const profileMenuRef = useRef(null)
  const notificationMenuRef = useRef(null)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showAllNotifications, setShowAllNotifications] = useState(false)
  const [serverNotifications, setServerNotifications] = useState([])
  const [viewedNotificationIds, setViewedNotificationIds] = useState([])
  const [clearedNotificationIds, setClearedNotificationIds] = useState([])
  const [notificationPrefsHydrated, setNotificationPrefsHydrated] = useState(false)
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
      const clickedInsideSearch = searchContainerRef.current?.contains(event.target)
      const clickedInsideProfile = profileMenuRef.current?.contains(event.target)
      const clickedInsideNotifications = notificationMenuRef.current?.contains(event.target)

      if (!clickedInsideSearch) {
        setIsSearchOpen(false)
      }

      if (!clickedInsideProfile) {
        setShowProfileMenu(false)
      }

      if (!clickedInsideNotifications) {
        setShowNotifications(false)
        setShowAllNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    setShowProfileMenu(false)
    setShowNotifications(false)
    setShowAllNotifications(false)
  }, [location.pathname])

  const notificationRecipientId = authUser?.id || user?.id || null

  useEffect(() => {
    let active = true
    let refreshTimerId = null

    const loadServerNotifications = async () => {
      if (!notificationRecipientId) {
        if (active) setServerNotifications([])
        return
      }

      const { data, error } = await supabase
        .from('farmer_notifications')
        .select('id, title, message, created_at, cluster_id, notification_type')
        .eq('recipient_user_id', notificationRecipientId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!active) return

      if (error) {
        console.error('Error loading farmer notifications:', error.message)
        setServerNotifications([])
        return
      }

      const mapped = (data || []).map((item) => {
        const createdAtLabel = item.created_at ? new Date(item.created_at).toLocaleString() : ''
        const detailParts = [item.message]
        if (createdAtLabel) detailParts.push(createdAtLabel)

        return {
          id: `admin-${item.id}`,
          title: item.title || 'New admin notification',
          detail: detailParts.filter(Boolean).join(' • '),
          source: 'admin',
          clusterId: item.cluster_id,
          type: item.notification_type,
        }
      })

      setServerNotifications(mapped)
    }

    const handleWindowFocus = () => {
      loadServerNotifications()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadServerNotifications()
      }
    }

    loadServerNotifications()
    refreshTimerId = window.setInterval(loadServerNotifications, 15000)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      if (refreshTimerId) {
        window.clearInterval(refreshTimerId)
      }
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [notificationRecipientId])

  const rawNotifications = useMemo(() => {
    const items = []

    if (serverNotifications.length > 0) {
      items.push(...serverNotifications)
    }

    if (!farm?.farm_name || farm.farm_name === 'My Farm') {
      items.push({
        id: 'farm-register',
        title: 'Farm details are incomplete',
        detail: 'Register your farm details to unlock complete tracking.',
      })
    }

    if ((clusters || []).length === 0) {
      items.push({
        id: 'clusters-empty',
        title: 'No clusters added yet',
        detail: 'Add your first cluster to start recording growth and harvest data.',
      })
    } else {
      items.push({
        id: `clusters-total-${clusters.length}`,
        title: `${clusters.length} cluster(s) in your farm`,
        detail: 'Keep records updated for better recommendations.',
      })
    }

    const harvestReadyClusters = (clusters || []).filter((cluster) => cluster.plantStage === 'ready-to-harvest')
    if (harvestReadyClusters.length > 0) {
      items.push({
        id: `harvest-ready-${harvestReadyClusters.length}`,
        title: `${harvestReadyClusters.length} cluster(s) ready to harvest`,
        detail: 'Open Harvest to update actual yield and quality records.',
      })
    }

    ;(clusters || [])
      .filter((cluster) => cluster.plantStage === 'flowering')
      .forEach((cluster) => {
        const estimatedFlowering = cluster?.stageData?.estimatedFloweringDate
        items.push({
          id: `flowering-${cluster.id}-${estimatedFlowering || 'pending'}`,
          title: `${cluster.clusterName} is in flowering stage`,
          detail: estimatedFlowering
            ? `Estimated flowering date: ${estimatedFlowering}`
            : 'Set estimated and actual flowering dates in Overview.',
        })
      })

    return items
  }, [clusters, farm, serverNotifications])

  const notificationViewedKey = user?.id
    ? `${NOTIFICATION_VIEWED_KEY_PREFIX}:${user.id}`
    : `${NOTIFICATION_VIEWED_KEY_PREFIX}:guest`
  const notificationClearedKey = user?.id
    ? `${NOTIFICATION_CLEARED_KEY_PREFIX}:${user.id}`
    : `${NOTIFICATION_CLEARED_KEY_PREFIX}:guest`
  const guestNotificationViewedKey = `${NOTIFICATION_VIEWED_KEY_PREFIX}:guest`
  const guestNotificationClearedKey = `${NOTIFICATION_CLEARED_KEY_PREFIX}:guest`

  useEffect(() => {
    setNotificationPrefsHydrated(false)

    try {
      const savedViewed = localStorage.getItem(notificationViewedKey)
      let parsedViewed = savedViewed ? JSON.parse(savedViewed) : []

      if (user?.id && (!Array.isArray(parsedViewed) || parsedViewed.length === 0)) {
        const guestViewed = localStorage.getItem(guestNotificationViewedKey)
        const parsedGuestViewed = guestViewed ? JSON.parse(guestViewed) : []
        if (Array.isArray(parsedGuestViewed) && parsedGuestViewed.length > 0) {
          parsedViewed = parsedGuestViewed
        }
      }

      setViewedNotificationIds(Array.isArray(parsedViewed) ? parsedViewed : [])
    } catch {
      setViewedNotificationIds([])
    }

    try {
      const savedCleared = localStorage.getItem(notificationClearedKey)
      let parsedCleared = savedCleared ? JSON.parse(savedCleared) : []

      if (user?.id && (!Array.isArray(parsedCleared) || parsedCleared.length === 0)) {
        const guestCleared = localStorage.getItem(guestNotificationClearedKey)
        const parsedGuestCleared = guestCleared ? JSON.parse(guestCleared) : []
        if (Array.isArray(parsedGuestCleared) && parsedGuestCleared.length > 0) {
          parsedCleared = parsedGuestCleared
        }
      }

      setClearedNotificationIds(Array.isArray(parsedCleared) ? parsedCleared : [])
    } catch {
      setClearedNotificationIds([])
    }

    setNotificationPrefsHydrated(true)
  }, [
    guestNotificationClearedKey,
    guestNotificationViewedKey,
    notificationClearedKey,
    notificationViewedKey,
    user?.id,
  ])

  useEffect(() => {
    if (!notificationPrefsHydrated) return

    try {
      localStorage.setItem(notificationViewedKey, JSON.stringify(viewedNotificationIds))
    } catch {
      // Ignore storage write errors in restricted browser contexts.
    }
  }, [notificationPrefsHydrated, notificationViewedKey, viewedNotificationIds])

  useEffect(() => {
    if (!notificationPrefsHydrated) return

    try {
      localStorage.setItem(notificationClearedKey, JSON.stringify(clearedNotificationIds))
    } catch {
      // Ignore storage write errors in restricted browser contexts.
    }
  }, [clearedNotificationIds, notificationClearedKey, notificationPrefsHydrated])

  const notifications = useMemo(
    () => rawNotifications.filter((item) => !clearedNotificationIds.includes(item.id)),
    [rawNotifications, clearedNotificationIds]
  )

  const unreadNotificationCount = useMemo(
    () =>
      notificationPrefsHydrated
        ? notifications.filter((item) => !viewedNotificationIds.includes(item.id)).length
        : 0,
    [notificationPrefsHydrated, notifications, viewedNotificationIds]
  )

  const displayedNotifications = showAllNotifications ? notifications : notifications.slice(0, 3)

  const markNotificationsAsViewed = () => {
    setViewedNotificationIds((prev) => {
      const merged = new Set([...prev, ...notifications.map((item) => item.id)])
      return [...merged]
    })
  }

  const handleToggleNotifications = () => {
    setShowNotifications((prev) => {
      const willOpen = !prev
      if (willOpen) {
        markNotificationsAsViewed()
      }
      if (!willOpen) {
        setShowAllNotifications(false)
      }
      return willOpen
    })
  }

  const handleClearNotifications = () => {
    if (notifications.length === 0) return

    const idsToClear = notifications.map((item) => item.id)
    setClearedNotificationIds((prev) => [...new Set([...prev, ...idsToClear])])
    setViewedNotificationIds((prev) => [...new Set([...prev, ...idsToClear])])
    setShowAllNotifications(false)
  }

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
  const mobileNavItems = navItems
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
          <div className="sidebar-logo-badge">
            <img src="/logo.png" alt="IKAPE logo" className="sidebar-logo-image" />
          </div>
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
            <div className="notification-menu" ref={notificationMenuRef}>
              <button
                type="button"
                className="topbar-icon-btn notification-trigger"
                onClick={handleToggleNotifications}
                aria-haspopup="menu"
                aria-expanded={showNotifications}
                aria-label="Notifications"
              >
                <Bell size={20} />
                {unreadNotificationCount > 0 && (
                  <span className="notification-badge">{Math.min(unreadNotificationCount, 99)}</span>
                )}
              </button>
              {showNotifications && (
                <div className="notification-dropdown" role="menu" aria-label="Notifications">
                  <div className="notification-header">
                    <h4>Notifications</h4>
                    <div className="notification-header-actions">
                      <span>{unreadNotificationCount > 0 ? `${unreadNotificationCount} new` : 'All caught up'}</span>
                      <button
                        type="button"
                        className="notification-clear-btn"
                        onClick={handleClearNotifications}
                        disabled={notifications.length === 0}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {displayedNotifications.length === 0 ? (
                    <div className="notification-empty">No notifications available.</div>
                  ) : (
                    <div className="notification-list">
                      {displayedNotifications.map((item) => (
                        <div key={item.id} className="notification-item">
                          <span className="notification-item-title">{item.title}</span>
                          <span className="notification-item-detail">{item.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {notifications.length > 3 && (
                    <button
                      type="button"
                      className="notification-view-more"
                      onClick={() => setShowAllNotifications((prev) => !prev)}
                    >
                      {showAllNotifications ? 'Show less' : 'View more'}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="user-menu" ref={profileMenuRef}>
              <button
                type="button"
                className="user-info user-info-trigger"
                onClick={() => setShowProfileMenu((prev) => !prev)}
                aria-expanded={showProfileMenu}
                aria-haspopup="menu"
              >
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
                <ChevronDown size={14} className={`user-menu-chevron ${showProfileMenu ? 'user-menu-chevron--open' : ''}`} />
              </button>
              {showProfileMenu && (
                <div className="user-dropdown" role="menu">
                  <button
                    type="button"
                    className="user-dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false)
                      setLogoutConfirm(true)
                    }}
                  >
                    <LogOut size={15} />
                    Log Out
                  </button>
                </div>
              )}
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
        title="Log out of your account?"
        message="Your current session will end on this device."
        confirmText="Log Out"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  )
}
