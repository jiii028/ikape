import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
    LayoutDashboard,
    Users,
    TrendingUp,
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
import './AdminLayout.css'

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const SIDEBAR_PREF_KEY = 'ikape_admin_sidebar_collapsed'
const ADMIN_NAV_ITEMS = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/farmers', icon: Users, label: 'Farmers' },
    { path: '/admin/prediction', icon: TrendingUp, label: 'Prediction' },
]

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const timeoutRef = useRef(null)
    const profileMenuRef = useRef(null)
    const searchContainerRef = useRef(null)
    const [showProfileMenu, setShowProfileMenu] = useState(false)
    const [lastActivity, setLastActivity] = useState(Date.now())
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

            if (!clickedInsideProfile) {
                setShowProfileMenu(false)
            }

            if (!clickedInsideSearch) {
                setIsSearchOpen(false)
            }
        }

        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [])

    useEffect(() => {
        setShowProfileMenu(false)
        setIsSearchOpen(false)
    }, [location.pathname])

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
            setLastActivity(Date.now())
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
                        <span>Session active - {Math.floor((Date.now() - lastActivity) / 60000)}m</span>
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
                        <button className="admin-topbar-icon-btn">
                            <Bell size={20} />
                        </button>
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
                title="Confirm Logout"
                message="Are you sure you want to log out? You will need to log in again to access your admin account."
                confirmText="Log Out"
                cancelText="Cancel"
                variant="warning"
            />
        </div>
    )
}
