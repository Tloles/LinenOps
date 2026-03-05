import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'

function routesPath(role) {
  return role === 'owner' ? '/routes' : '/routes/today'
}

function NavTab({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `min-h-[48px] px-4 flex items-center text-sm font-medium border-b-2 ${
          isActive
            ? 'border-[#1B2541] text-[#1B2541]'
            : 'border-transparent text-gray-400 hover:text-gray-600'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function Layout() {
  const { user, role, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-[#1B2541] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white tracking-wide">White Sail</h1>
          <span className="text-sm text-slate-400 font-medium hidden sm:inline">LinenOps</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white capitalize">
            {role}
          </span>
          <span className="text-sm text-slate-300 hidden sm:inline">{user?.email}</span>
          <button
            onClick={signOut}
            className="min-h-[48px] px-4 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20"
          >
            Sign Out
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto">
        {role === 'owner' && <NavTab to="/dashboard">Dashboard</NavTab>}
        <NavTab to="/scan">Scan</NavTab>
        {role !== 'driver' && <NavTab to="/bins">Bins</NavTab>}
        {role !== 'driver' && <NavTab to="/wash">Wash Form</NavTab>}
        {role !== 'driver' && <NavTab to="/wash-info">Wash Info</NavTab>}
        {role === 'owner' && <NavTab to="/customers">Customers</NavTab>}
        {role !== 'production' && (
          <NavTab to={routesPath(role)}>Routes</NavTab>
        )}
      </nav>

      <main className="flex-1 p-2 sm:p-3 w-full" style={{ overflowX: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  )
}
