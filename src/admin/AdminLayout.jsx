import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useRef, useState } from 'react'
import {
    LayoutDashboard,
    Users,
    TrendingUp,
    LogOut,
    Sprout,
    Search,
    Bell,
    User,
    Shield,
    ChevronDown,
    Clock,
} from 'lucide-react'
import './AdminLayout.css'

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const timeoutRef = useRef(null)
    const [showProfileMenu, setShowProfileMenu] = useState(false)
    const [lastActivity, setLastActivity] = useState(Date.now())

    // Session timeout — auto logout after 30 min inactivity
    useEffect(() => {
        const resetTimer = () => {
            setLastActivity(Date.now())
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(async () => {
                await logout()
                navigate('/login')
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
        navigate('/login')
    }

    const navItems = [
        { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/admin/farmers', icon: Users, label: 'Registered Farmers' },
        { path: '/admin/prediction', icon: TrendingUp, label: 'Prediction' },
    ]

    const minutesSinceActivity = Math.floor((Date.now() - lastActivity) / 60000)

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <div className="admin-sidebar-header">
                    <Sprout size={28} className="admin-sidebar-logo-icon" />
                    <div>
                        <span className="admin-sidebar-title">IKAPE</span>
                        <span className="admin-sidebar-badge">ADMIN</span>
                    </div>
                </div>

                <nav className="admin-sidebar-nav">
                    {navItems.map((item) => (
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
                        <span>Session active</span>
                    </div>
                    <button className="admin-logout-btn" onClick={handleLogout}>
                        <LogOut size={20} />
                        <span>Log Out</span>
                    </button>
                </div>
            </aside>

            <main className="admin-main-content">
                <header className="admin-topbar">
                    <div className="admin-topbar-left">
                        <div className="admin-search-bar">
                            <Search size={18} className="admin-search-icon" />
                            <input type="text" placeholder="Search farmers, farms, clusters..." />
                        </div>
                    </div>
                    <div className="admin-topbar-right">
                        <button className="admin-topbar-icon-btn">
                            <Bell size={20} />
                        </button>
                        <div
                            className="admin-user-info"
                            onClick={() => setShowProfileMenu(!showProfileMenu)}
                        >
                            <div className="admin-user-avatar">
                                <Shield size={18} />
                            </div>
                            <div className="admin-user-details">
                                <span className="admin-user-name">
                                    Sir Ernesto
                                </span>
                                <span className="admin-user-role">Quality Control Manager</span>
                            </div>
                            <ChevronDown size={16} className="admin-chevron" />
                            {showProfileMenu && (
                                <div className="admin-profile-dropdown">
                                    <button onClick={handleLogout}>
                                        <LogOut size={16} /> Sign Out
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
        </div>
    )
}
