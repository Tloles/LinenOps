import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'

function routesPath(role) {
  return role === 'owner' || role === 'manager' ? '/routes' : '/routes/today'
}

function NavTab({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `min-h-[56px] px-4 flex items-center text-base font-medium border-b-2 ${
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
  const { user, role, fullName, signOut } = useAuth()
  const firstName = fullName?.split(' ')[0]

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-[#1B2541] px-4 py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <img src="/header-logo.png" alt="White Sail" className="h-[100px] w-auto" />
          <h1 className="text-2xl font-bold text-white tracking-wide">White Sail</h1>
          <span className="text-base text-slate-400 font-medium hidden sm:inline">LinenOps</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-base text-slate-200 hidden sm:inline">
            {firstName ? `Welcome, ${firstName}` : ''}{firstName && role ? ' · ' : ''}<span className="capitalize">{role}</span>
          </span>
          <button
            onClick={signOut}
            className="min-h-[48px] px-5 text-base font-medium text-white bg-white/10 rounded-lg hover:bg-white/20"
          >
            Sign Out
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto no-print">
        {(role === 'owner' || role === 'manager') && <NavTab to="/dashboard">Dashboard</NavTab>}
        <NavTab to="/scan">Scan</NavTab>
        {role !== 'driver' && <NavTab to="/bins">Bins</NavTab>}
        {role !== 'driver' && <NavTab to="/wash">Wash Form</NavTab>}
        {role !== 'driver' && <NavTab to="/wash-info">Wash Info</NavTab>}
        {role !== 'driver' && <NavTab to="/production">Production Form</NavTab>}
        {(role === 'owner' || role === 'manager') && <NavTab to="/production-info">Production Info</NavTab>}
        {(role === 'owner' || role === 'manager') && <NavTab to="/customers">Customers</NavTab>}
        {(role === 'owner' || role === 'manager') && <NavTab to="/invoicing">Invoicing</NavTab>}
        {role === 'owner' && <NavTab to="/users">Users</NavTab>}
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
