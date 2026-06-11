import { NavLink } from 'react-router-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../api/client'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/blood-pressure', label: 'Blood Pressure' },
  { to: '/food-hydration', label: 'Daily Intake' },
  { to: '/sleep-recovery', label: 'Sleep & Recovery' },
  { to: '/insights', label: 'Insights' },
]

export default function Sidebar() {
  const [status, setStatus] = useState({ state: 'checking' })
  const [appleHealthSync, setAppleHealthSync] = useState({ value: null, loaded: false })
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 'idle' | 'requesting' | 'polling' | 'synced' | 'timeout' | 'error'
  const [syncPhase, setSyncPhase] = useState('idle')
  const [syncMessage, setSyncMessage] = useState(null)
  const pollRef = useRef(null)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    checkHealth()
    const id = setInterval(checkHealth, 30000)
    return () => clearInterval(id)
  }, [])

  // Load the real Apple Health sync time on mount, and refresh it whenever
  // dashboard data refreshes (e.g. after a successful sync).
  useEffect(() => {
    fetchSyncStatus()
    window.addEventListener('bp:sync-complete', fetchSyncStatus)
    return () => window.removeEventListener('bp:sync-complete', fetchSyncStatus)
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
      setStatus({ state: 'connected' })
    } catch {
      setStatus(prev => ({ ...prev, state: 'unreachable' }))
    }
  }

  async function fetchSyncStatus() {
    try {
      const { lastSync } = await api.getSyncStatus()
      setAppleHealthSync({ value: lastSync, loaded: true })
    } catch {
      // leave the previously displayed value in place
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => stopPolling(), [])

  async function syncNow() {
    if (syncPhase === 'requesting' || syncPhase === 'polling') return
    stopPolling()
    setSyncPhase('requesting')
    setSyncMessage(null)

    let requestedAt
    try {
      const [, syncResult] = await Promise.all([
        api.ouraManualSync(),
        api.requestSync(),
      ])
      requestedAt = syncResult?.requestedAt ? new Date(syncResult.requestedAt) : new Date()
    } catch (err) {
      setSyncPhase('error')
      setSyncMessage(err.message || 'Sync failed')
      return
    }

    setSyncPhase('polling')
    const deadline = Date.now() + 20000

    pollRef.current = setInterval(async () => {
      try {
        const { lastSync } = await api.getSyncStatus()
        if (lastSync && new Date(lastSync).getTime() > requestedAt.getTime()) {
          stopPolling()
          setSyncPhase('synced')
          window.dispatchEvent(new CustomEvent('bp:sync-complete'))
          setTimeout(() => setSyncPhase(p => (p === 'synced' ? 'idle' : p)), 5000)
          return
        }
      } catch {
        // keep polling
      }
      if (Date.now() >= deadline) {
        stopPolling()
        setSyncPhase('timeout')
      }
    }, 2000)
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
              {syncPhase === 'requesting' && 'Requesting Apple Health sync…'}
              {syncPhase === 'polling' && 'Waiting for Apple Health sync…'}
              {syncPhase === 'synced' && 'Apple Health synced ✓'}
              {syncPhase === 'timeout' && 'No Apple Health sync received — unlock your phone and try again'}
              {syncPhase === 'error' && (syncMessage || 'Apple Health sync failed')}
              {syncPhase === 'idle' && status.state === 'connected' && 'Pipeline connected'}
              {syncPhase === 'idle' && status.state === 'unreachable' && 'Backend unreachable'}
              {syncPhase === 'idle' && status.state === 'checking' && 'Checking…'}
            </span>
            {syncPhase === 'idle' && appleHealthSync.loaded && (
              <span className="status-sync">
                {formatAppleHealthSync(appleHealthSync.value)}
              </span>
            )}
          </div>
          <button
            className="sync-btn"
            onClick={syncNow}
            title="Sync Apple Health"
            disabled={syncPhase === 'requesting' || syncPhase === 'polling'}
            aria-label="Sync Apple Health"
          >
            <RefreshCw className={`sync-icon${syncPhase === 'requesting' || syncPhase === 'polling' ? ' sync-icon--spinning' : ''}`} />
          </button>
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

// Render the last Apple Health sync time as a relative, explicitly-labeled string.
function formatAppleHealthSync(lastSync) {
  if (!lastSync) return 'No Apple Health sync recorded'
  const then = new Date(lastSync)
  const mins = Math.floor((Date.now() - then.getTime()) / 60000)
  if (mins < 1) return 'Apple Health synced just now'
  if (mins < 60) return `Apple Health synced ${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Apple Health synced ${hrs} hr ago`
  const when = then.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `Apple Health synced ${when}`
}
