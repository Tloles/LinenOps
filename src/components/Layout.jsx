import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard,
  QrCode,
  Package,
  FileText,
  BarChart2,
  ClipboardList,
  Activity,
  Building2,
  DollarSign,
  Users as UsersIcon,
  Map,
  MoreHorizontal,
  X,
  LogOut,
} from 'lucide-react'

function routesPath(role) {
  return role === 'owner' || role === 'manager' ? '/routes' : '/routes/today'
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: r => r === 'owner' || r === 'manager' },
  { to: '/scan', label: 'Scan', icon: QrCode, show: () => true },
  { to: '/bins', label: 'Bins', icon: Package, show: r => r !== 'driver' },
  { to: '/wash', label: 'Wash Form', icon: FileText, show: r => r !== 'driver' },
  { to: '/wash-info', label: 'Wash Info', icon: BarChart2, show: r => r !== 'driver' },
  { to: '/production', label: 'Production Form', icon: ClipboardList, show: r => r !== 'driver' },
  { to: '/production-info', label: 'Production Info', icon: Activity, show: r => r === 'owner' || r === 'manager' },
  { to: '/customers', label: 'Customers', icon: Building2, show: r => r === 'owner' || r === 'manager' },
  { to: '/invoicing', label: 'Invoicing', icon: DollarSign, show: r => r === 'owner' || r === 'manager' },
  { to: '/users', label: 'Users', icon: UsersIcon, show: r => r === 'owner' },
  { to: 'ROUTES', label: 'Routes', icon: Map, show: r => r !== 'production' },
]

const MOBILE_PRIORITY = {
  driver: ['/scan', '/bins', 'ROUTES'],
  production: ['/scan', '/bins', '/production', '/wash'],
  manager: ['/dashboard', '/production-info', '/production', '/invoicing'],
  owner: ['/dashboard', '/production-info', '/invoicing', '/users'],
}

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/scan': 'Scan',
  '/bins': 'Bins',
  '/wash': 'Wash Form',
  '/wash-info': 'Wash Info',
  '/production': 'Production Form',
  '/production-info': 'Production Info',
  '/customers': 'Customers',
  '/invoicing': 'Invoicing',
  '/users': 'Users',
  '/routes': 'Routes',
  '/routes/today': 'Routes',
}

function resolveTo(item, role) {
  return item.to === 'ROUTES' ? routesPath(role) : item.to
}

export default function Layout() {
  const { role, fullName, signOut } = useAuth()
  const firstName = fullName?.split(' ')[0]
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const visibleItems = NAV_ITEMS.filter(item => item.show(role))

  // Mobile: split into bottom bar items + more drawer items
  const priorityPaths = MOBILE_PRIORITY[role] || []
  const bottomItems = priorityPaths
    .map(p => visibleItems.find(item => item.to === p))
    .filter(Boolean)
  const bottomPaths = new Set(bottomItems.map(item => item.to))
  const moreItems = visibleItems.filter(item => !bottomPaths.has(item.to))

  const pageTitle = PAGE_TITLES[location.pathname] || 'LinenOps'

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 bg-[#1B2541] no-print">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4">
          <img src="/header-logo.png" alt="White Sail" className="h-16 w-auto" />
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">White Sail</h1>
            <span className="text-sm text-slate-400 font-medium">LinenOps</span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {visibleItems.map(item => {
            const Icon = item.icon
            const to = resolveTo(item, role)
            return (
              <NavLink
                key={item.to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon size={20} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        {/* User Info + Sign Out */}
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-sm text-slate-300 mb-2">
            {firstName ? `Welcome, ${firstName}` : ''}{firstName && role ? ' · ' : ''}<span className="capitalize">{role}</span>
          </p>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-[#1B2541] flex items-center justify-between px-4 no-print">
        <div className="flex items-center gap-2">
          <img src="/header-logo.png" alt="White Sail" className="h-9 w-auto" />
          <span className="text-base font-semibold text-white">{pageTitle}</span>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </header>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-[#1e3a5f] flex items-center justify-around px-2 no-print">
        {bottomItems.map(item => {
          const Icon = item.icon
          const to = resolveTo(item, role)
          return (
            <NavLink
              key={item.to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-xs font-medium min-w-[56px] ${
                  isActive ? 'text-white border-b-2 border-white' : 'text-white/60'
                }`
              }
            >
              <Icon size={22} />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </NavLink>
          )
        })}
        {moreItems.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-xs font-medium text-white/60 min-w-[56px]"
          >
            <MoreHorizontal size={22} />
            <span>More</span>
          </button>
        )}
      </nav>

      {/* ── More Drawer (mobile) ── */}
      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[70vh] overflow-y-auto no-print">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-base font-semibold text-gray-900">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="py-2">
              {moreItems.map(item => {
                const Icon = item.icon
                const to = resolveTo(item, role)
                return (
                  <NavLink
                    key={item.to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 text-sm font-medium ${
                        isActive ? 'text-[#1B2541] bg-gray-50' : 'text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <Icon size={20} />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        </>
      )}

      {/* ── Main Content ── */}
      <main
        className="pt-14 pb-16 lg:pt-0 lg:pb-0 lg:ml-64 flex-1 p-2 sm:p-3 min-h-screen"
        style={{ overflowX: 'hidden' }}
      >
        <Outlet />
      </main>
    </div>
  )
}
