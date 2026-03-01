import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
    LayoutDashboard,
    Users,
    TrendingUp,
    CloudRain,
    LogOut,
    Search,
    Bell,
    Shield,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    X,
    Layers,
    Wheat,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog'

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const SIDEBAR_PREF_KEY = 'ikape_admin_sidebar_collapsed'
const ADMIN_NOTIF_VIEWED_KEY_PREFIX = 'ikape_admin_notifications_viewed'
const ADMIN_NOTIF_CLEARED_KEY_PREFIX = 'ikape_admin_notifications_cleared'
const ADMIN_NAV_ITEMS = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/farmers', icon: Users, label: 'Farmers' },
    { path: '/admin/prediction', icon: TrendingUp, label: 'Prediction' },
    { path: '/admin/agriclimatic', icon: CloudRain, label: 'AgriClimate' },
]

function readNotificationIds(primaryKey, fallbackKey = '') {
    try {
        const savedPrimary = localStorage.getItem(primaryKey)
        const parsedPrimary = savedPrimary ? JSON.parse(savedPrimary) : []
        if (Array.isArray(parsedPrimary) && parsedPrimary.length > 0) {
            return parsedPrimary
        }

        if (!fallbackKey) {
            return Array.isArray(parsedPrimary) ? parsedPrimary : []
        }

        const savedFallback = localStorage.getItem(fallbackKey)
        const parsedFallback = savedFallback ? JSON.parse(savedFallback) : []
        return Array.isArray(parsedFallback) ? parsedFallback : []
    } catch {
        return []
    }
}

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const timeoutRef = useRef(null)
    const profileMenuRef = useRef(null)
    const searchContainerRef = useRef(null)
    const notificationMenuRef = useRef(null)
    const [showProfileMenu, setShowProfileMenu] = useState(false)
    const [showNotifications, setShowNotifications] = useState(false)
    const [showAllNotifications, setShowAllNotifications] = useState(false)
    const [viewedNotificationIds, setViewedNotificationIds] = useState(() =>
        readNotificationIds(
            user?.id ? `${ADMIN_NOTIF_VIEWED_KEY_PREFIX}:${user.id}` : `${ADMIN_NOTIF_VIEWED_KEY_PREFIX}:guest`,
            user?.id ? `${ADMIN_NOTIF_VIEWED_KEY_PREFIX}:guest` : ''
        )
    )
    const [clearedNotificationIds, setClearedNotificationIds] = useState(() =>
        readNotificationIds(
            user?.id ? `${ADMIN_NOTIF_CLEARED_KEY_PREFIX}:${user.id}` : `${ADMIN_NOTIF_CLEARED_KEY_PREFIX}:guest`,
            user?.id ? `${ADMIN_NOTIF_CLEARED_KEY_PREFIX}:guest` : ''
        )
    )
    const [minutesSinceActivity, setMinutesSinceActivity] = useState(0)
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
    const [searchEntities, setSearchEntities] = useState({
        farmers: [],
        farms: [],
        clusters: [],
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
            const clickedInsideProfile = profileMenuRef.current?.contains(event.target)
            const clickedInsideSearch = searchContainerRef.current?.contains(event.target)
            const clickedInsideNotifications = notificationMenuRef.current?.contains(event.target)

            if (!clickedInsideProfile) {
                setShowProfileMenu(false)
            }

            if (!clickedInsideSearch) {
                setIsSearchOpen(false)
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
        const fetchSearchEntities = async () => {
            try {
                const [farmersRes, farmsRes, clustersRes] = await Promise.all([
                    supabase
                        .from('users')
                        .select('id, first_name, last_name, municipality, province')
                        .eq('role', 'farmer')
                        .limit(120),
                    supabase
                        .from('farms')
                        .select('id, farm_name')
                        .limit(120),
                    supabase
                        .from('clusters')
                        .select('id, cluster_name, plant_stage, farms(farm_name)')
                        .limit(180),
                ])

                setSearchEntities({
                    farmers: farmersRes.data || [],
                    farms: farmsRes.data || [],
                    clusters: clustersRes.data || [],
                })
            } catch (error) {
                console.error('Admin search preload failed:', error)
            }
        }

        fetchSearchEntities()
    }, [])

    // Session timeout — auto logout after 30 min inactivity
    useEffect(() => {
        const resetTimer = () => {
            setMinutesSinceActivity(0)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(async () => {
                await logout()
                navigate('/login', { replace: true })
            }, SESSION_TIMEOUT_MS)
        }

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
        events.forEach((e) => window.addEventListener(e, resetTimer))
        resetTimer()

        return () => {
            events.forEach((e) => window.removeEventListener(e, resetTimer))
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [logout, navigate])

    useEffect(() => {
        const intervalRef = setInterval(() => {
            setMinutesSinceActivity((prev) => prev + 1)
        }, 60 * 1000)
        return () => clearInterval(intervalRef)
    }, [])

    const handleLogout = async () => {
        await logout()
        navigate('/login', { replace: true })
    }

    const normalizedSearch = searchQuery.trim().toLowerCase()
    const searchResults = useMemo(() => {
        if (!normalizedSearch) return []

        const pageResults = ADMIN_NAV_ITEMS
            .filter((item) => item.label.toLowerCase().includes(normalizedSearch))
            .map((item) => ({
                id: `page-${item.path}`,
                icon: item.icon,
                label: item.label,
                detail: 'Navigate to page',
                path: item.path,
            }))

        const farmerResults = searchEntities.farmers
            .filter((farmer) => {
                const fullName = `${farmer.first_name || ''} ${farmer.last_name || ''}`.trim().toLowerCase()
                const locationLabel = [farmer.municipality, farmer.province]
                    .filter(Boolean)
                    .join(', ')
                    .toLowerCase()
                return fullName.includes(normalizedSearch) || locationLabel.includes(normalizedSearch)
            })
            .map((farmer) => {
                const fullName = `${farmer.first_name || ''} ${farmer.last_name || ''}`.trim()
                const locationLabel = [farmer.municipality, farmer.province].filter(Boolean).join(', ')
                return {
                    id: `farmer-${farmer.id}`,
                    icon: Users,
                    label: fullName || 'Unnamed farmer',
                    detail: locationLabel || 'Farmer profile',
                    path: `/admin/farmers?q=${encodeURIComponent(fullName || '')}`,
                }
            })

        const farmResults = searchEntities.farms
            .filter((farm) => (farm.farm_name || '').toLowerCase().includes(normalizedSearch))
            .map((farm) => ({
                id: `farm-${farm.id}`,
                icon: Wheat,
                label: farm.farm_name || 'Unnamed farm',
                detail: 'View in prediction',
                path: `/admin/prediction?view=farm&q=${encodeURIComponent(farm.farm_name || '')}`,
            }))

        const clusterResults = searchEntities.clusters
            .filter((cluster) => {
                const clusterName = (cluster.cluster_name || '').toLowerCase()
                const stage = (cluster.plant_stage || '').toLowerCase()
                const farmName = (cluster.farms?.farm_name || '').toLowerCase()
                return (
                    clusterName.includes(normalizedSearch) ||
                    stage.includes(normalizedSearch) ||
                    farmName.includes(normalizedSearch)
                )
            })
            .map((cluster) => ({
                id: `cluster-${cluster.id}`,
                icon: Layers,
                label: cluster.cluster_name || 'Unnamed cluster',
                detail: `${cluster.plant_stage || 'Unknown stage'} · ${cluster.farms?.farm_name || 'Unknown farm'}`,
                path: `/admin/dashboard?cluster=${encodeURIComponent(cluster.id)}`,
            }))

        return [...pageResults, ...farmerResults, ...farmResults, ...clusterResults].slice(0, 10)
    }, [normalizedSearch, searchEntities])

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

    const rawNotifications = useMemo(() => {
        const farmersCount = searchEntities.farmers.length
        const farmsCount = searchEntities.farms.length
        const clustersCount = searchEntities.clusters.length

        const items = [
            {
                id: `farmers-${farmersCount}`,
                title: `${farmersCount} registered farmer(s)`,
                detail: 'Review farmer profiles and account statuses.',
            },
            {
                id: `farms-${farmsCount}`,
                title: `${farmsCount} total farm(s)`,
                detail: 'Monitor farm activity from dashboard analytics.',
            },
            {
                id: `clusters-${clustersCount}`,
                title: `${clustersCount} active cluster(s)`,
                detail: 'Track cluster stage data and risk indicators.',
            },
            {
                id: 'session-monitor',
                title: 'Admin session monitor',
                detail: `Last activity ${minutesSinceActivity} minute(s) ago.`,
            },
            {
                id: 'search-tip',
                title: 'Search tip',
                detail: 'Use global search to jump to a farmer, farm, or cluster quickly.',
            },
        ]

        return items
    }, [searchEntities, minutesSinceActivity])

    const notificationViewedKey = user?.id
        ? `${ADMIN_NOTIF_VIEWED_KEY_PREFIX}:${user.id}`
        : `${ADMIN_NOTIF_VIEWED_KEY_PREFIX}:guest`
    const notificationClearedKey = user?.id
        ? `${ADMIN_NOTIF_CLEARED_KEY_PREFIX}:${user.id}`
        : `${ADMIN_NOTIF_CLEARED_KEY_PREFIX}:guest`

    useEffect(() => {
        try {
            localStorage.setItem(notificationViewedKey, JSON.stringify(viewedNotificationIds))
        } catch {
            // Ignore storage write errors in restricted browser contexts.
        }
    }, [notificationViewedKey, viewedNotificationIds])

    useEffect(() => {
        try {
            localStorage.setItem(notificationClearedKey, JSON.stringify(clearedNotificationIds))
        } catch {
            // Ignore storage write errors in restricted browser contexts.
        }
    }, [clearedNotificationIds, notificationClearedKey])

    const notifications = useMemo(
        () => rawNotifications.filter((item) => !clearedNotificationIds.includes(item.id)),
        [rawNotifications, clearedNotificationIds]
    )

    const unreadNotificationCount = useMemo(
        () => notifications.filter((item) => !viewedNotificationIds.includes(item.id)).length,
        [notifications, viewedNotificationIds]
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
            } else {
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

    return (
        <div className="admin-layout">
            <aside className={`admin-sidebar ${isSidebarCollapsed ? 'admin-sidebar--collapsed' : ''}`}>
                <div className="admin-sidebar-header">
                    <div className="admin-sidebar-logo-badge">
                        <img src="/logo.png" alt="IKAPE logo" className="admin-sidebar-logo-image" />
                    </div>
                    <div className="admin-sidebar-brand">
                        <span className="admin-sidebar-title">IKAPE</span>
                        <span className="admin-sidebar-badge">ADMIN</span>
                    </div>
                    <button
                        type="button"
                        className={`admin-sidebar-toggle ${isSidebarCollapsed ? 'admin-sidebar-toggle--collapsed' : ''}`}
                        onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-expanded={!isSidebarCollapsed}
                        title={isSidebarCollapsed ? 'Show labels (Ctrl+B)' : 'Hide labels (Ctrl+B)'}
                    >
                        {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                <nav className="admin-sidebar-nav">
                    {ADMIN_NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `admin-nav-item ${isActive ? 'admin-nav-item--active' : ''}`
                            }
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="admin-sidebar-footer">
                    <div className="admin-session-info">
                        <Clock size={14} />
                        <span>Session active - {minutesSinceActivity}m</span>
                    </div>
                    <button className="admin-logout-btn" onClick={() => setLogoutConfirm(true)}>
                        <LogOut size={20} />
                        <span>Log Out</span>
                    </button>
                </div>
            </aside>

            <main className={`admin-main-content ${isSidebarCollapsed ? 'admin-main-content--expanded' : ''}`}>
                <header className="admin-topbar">
                    <div className="admin-topbar-left">
                        <div className="admin-search-bar" ref={searchContainerRef}>
                            <Search size={18} className="admin-search-icon" />
                            <input
                                type="text"
                                value={searchQuery}
                                onFocus={() => setIsSearchOpen(true)}
                                onChange={(event) => {
                                    setSearchQuery(event.target.value)
                                    setIsSearchOpen(true)
                                }}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Search farmers, farms, clusters..."
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="admin-search-clear-btn"
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
                                <div className="admin-search-results">
                                    {searchResults.length === 0 ? (
                                        <div className="admin-search-empty">No matches found</div>
                                    ) : (
                                        searchResults.map((result) => (
                                            <button
                                                key={result.id}
                                                type="button"
                                                className="admin-search-result-item"
                                                onClick={() => handleSearchNavigate(result)}
                                            >
                                                <result.icon size={16} />
                                                <div className="admin-search-result-content">
                                                    <span className="admin-search-result-title">{result.label}</span>
                                                    <span className="admin-search-result-subtitle">{result.detail}</span>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="admin-topbar-right">
                        <div className="admin-notification-menu" ref={notificationMenuRef}>
                            <button
                                type="button"
                                className="admin-topbar-icon-btn admin-notification-trigger"
                                onClick={handleToggleNotifications}
                                aria-haspopup="menu"
                                aria-expanded={showNotifications}
                                aria-label="Notifications"
                            >
                                <Bell size={20} />
                                {unreadNotificationCount > 0 && (
                                    <span className="admin-notification-badge">{Math.min(unreadNotificationCount, 99)}</span>
                                )}
                            </button>
                            {showNotifications && (
                                <div className="admin-notification-dropdown" role="menu" aria-label="Admin notifications">
                                    <div className="admin-notification-header">
                                        <h4>Notifications</h4>
                                        <div className="admin-notification-header-actions">
                                            <span>{unreadNotificationCount > 0 ? `${unreadNotificationCount} new` : 'All read'}</span>
                                            <button
                                                type="button"
                                                className="admin-notification-clear-btn"
                                                onClick={handleClearNotifications}
                                                disabled={notifications.length === 0}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                    {displayedNotifications.length === 0 ? (
                                        <div className="admin-notification-empty">No notifications available.</div>
                                    ) : (
                                        <div className="admin-notification-list">
                                            {displayedNotifications.map((item) => (
                                                <div key={item.id} className="admin-notification-item">
                                                    <span className="admin-notification-item-title">{item.title}</span>
                                                    <span className="admin-notification-item-detail">{item.detail}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {notifications.length > 3 && (
                                        <button
                                            type="button"
                                            className="admin-notification-view-more"
                                            onClick={() => setShowAllNotifications((prev) => !prev)}
                                        >
                                            {showAllNotifications ? 'Show less' : 'View more'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="admin-user-menu" ref={profileMenuRef}>
                            <button
                                type="button"
                                className="admin-user-info"
                                onClick={() => setShowProfileMenu((prev) => !prev)}
                                aria-expanded={showProfileMenu}
                                aria-haspopup="menu"
                            >
                                <div className="admin-user-avatar">
                                    <Shield size={18} />
                                </div>
                                <div className="admin-user-details">
                                    <span className="admin-user-name">
                                        {user?.firstName} {user?.lastName}
                                    </span>
                                    <span className="admin-user-role">Administrator</span>
                                </div>
                                <ChevronDown size={16} className={`admin-chevron ${showProfileMenu ? 'admin-chevron--open' : ''}`} />
                            </button>
                            {showProfileMenu && (
                                <div className="admin-profile-dropdown" role="menu">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setShowProfileMenu(false)
                                            setLogoutConfirm(true)
                                        }}
                                    >
                                        <LogOut size={16} /> Log Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="admin-page-content">
                    <Outlet />
                </div>
            </main>

            <nav className="admin-mobile-nav">
                {ADMIN_NAV_ITEMS.map((item) => (
                    <NavLink
                        key={`mobile-${item.path}`}
                        to={item.path}
                        className={({ isActive }) =>
                            `admin-mobile-nav-item ${isActive ? 'admin-mobile-nav-item--active' : ''}`
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
                title="Log out of admin account?"
                message="Your current administrator session will end on this device."
                confirmText="Log Out"
                cancelText="Cancel"
                variant="warning"
            />
        </div>
    )
}
