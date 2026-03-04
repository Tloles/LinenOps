import { Routes, Route, Navigate } from 'react-router'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ScanPage from './pages/ScanPage'
import BinListPage from './pages/BinListPage'
import BinDetailPage from './pages/BinDetailPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import RoutesPage from './pages/RoutesPage'
import TodayRoutePage from './pages/TodayRoutePage'
import DriverRoutePage from './pages/DriverRoutePage'
import StopPage from './pages/StopPage'

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

function RoleRedirect() {
  const { role, loading } = useAuth()
  if (loading) return null
  if (role === 'driver') return <Navigate to="/routes/today" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleRedirect />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="bins" element={<BinListPage />} />
        <Route path="bins/:id" element={<BinDetailPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="routes/today" element={<TodayRoutePage />} />
        <Route path="routes/today/:routeId" element={<DriverRoutePage />} />
        <Route path="routes/today/:routeId/stops/:stopId" element={<StopPage />} />
      </Route>
    </Routes>
  )
}
