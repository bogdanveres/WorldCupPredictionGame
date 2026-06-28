import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const NAV_LINKS = [
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/groups', label: 'Groups' },
  { to: '/bracket', label: 'Bracket' },
  { to: '/teams', label: 'Teams' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/predictions', label: 'My Picks' },
]

export default function Navbar() {
  const { user, isAdmin, login, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <Link to="/" className="text-white font-bold text-lg tracking-tight shrink-0">
          ⚽ WC2026
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-4 text-sm flex-1">
          {NAV_LINKS.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                isActive ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'
              }
            >
              {l.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                isActive ? 'text-yellow-400 font-semibold' : 'text-yellow-600 hover:text-yellow-400'
              }
            >
              Admin
            </NavLink>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full hidden sm:block" />
              )}
              <button onClick={logout} className="text-slate-400 hover:text-white text-sm hidden sm:block">
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={login}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm font-medium"
            >
              Sign in
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-slate-400 hover:text-white"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden mt-3 pt-3 border-t border-slate-700 flex flex-col gap-3 text-sm">
          {NAV_LINKS.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                isActive ? 'text-white font-semibold' : 'text-slate-400'
              }
            >
              {l.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" onClick={() => setMenuOpen(false)} className="text-yellow-500">
              Admin
            </NavLink>
          )}
          {user ? (
            <button onClick={() => { logout(); setMenuOpen(false) }} className="text-slate-400 text-left">
              Sign out ({user.displayName})
            </button>
          ) : null}
        </div>
      )}
    </nav>
  )
}
