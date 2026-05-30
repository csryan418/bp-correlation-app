import { NavLink } from 'react-router-dom'
import { useEffect, useLayoutEffect, useState } from 'react'
import { api } from '../api/client'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/blood-pressure', label: 'Blood Pressure' },
  { to: '/food-hydration', label: 'Food & Hydration' },
  { to: '/sleep-recovery', label: 'Sleep & Recovery' },
]

export default function Sidebar() {
  const [status, setStatus] = useState({ state: 'checking', lastSync: null })
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    checkHealth()
    const id = setInterval(checkHealth, 30000)
    return () => clearInterval(id)
  }, [])

  // Close drawer when viewport widens past the mobile breakpoint
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setDrawerOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  async function checkHealth() {
    try {
      await api.health()
      setStatus({ state: 'connected', lastSync: new Date() })
    } catch {
      setStatus(prev => ({ ...prev, state: 'unreachable' }))
    }
  }

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  function closeDrawer() {
    setDrawerOpen(false)
  }

  // Shared content rendered in both the desktop sidebar and the mobile drawer
  function SidebarContent({ onNavClick }) {
    return (
      <>
        <div className="sidebar-header">
          <div className="sidebar-mark">◈</div>
          <div>
            <div className="sidebar-app-name">BP Journal</div>
            <div className="sidebar-subtitle">Health Tracker</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-item nav-item--active' : 'nav-item'
              }
              onClick={onNavClick}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-theme">
          <button className="theme-btn" onClick={toggleTheme}>
            <span className="theme-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="theme-label">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
        </div>

        <div className="sidebar-status">
          <span className={`status-dot status-dot--${status.state}`} />
          <div className="status-text">
            <span className="status-label">
              {status.state === 'connected' && 'Pipeline connected'}
              {status.state === 'unreachable' && 'Backend unreachable'}
              {status.state === 'checking' && 'Checking…'}
            </span>
            {status.lastSync && (
              <span className="status-sync">
                synced {formatRelative(status.lastSync)}
              </span>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside className="sidebar">
        <SidebarContent onNavClick={null} />
      </aside>

      {/* ── Mobile topbar (hidden on desktop) ───────── */}
      <header className="mobile-topbar">
        <div className="mobile-logo">
          <span className="sidebar-mark">◈</span>
          <span className="mobile-app-name">BP Journal</span>
        </div>
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
      </header>

      {/* ── Drawer overlay ──────────────────────────── */}
      <div
        className={`drawer-overlay${drawerOpen ? ' drawer-overlay--open' : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* ── Slide-in drawer ─────────────────────────── */}
      <aside
        className={`mobile-drawer${drawerOpen ? ' mobile-drawer--open' : ''}`}
        aria-modal="true"
        role="dialog"
      >
        <SidebarContent onNavClick={closeDrawer} />
      </aside>
    </>
  )
}

function formatRelative(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
