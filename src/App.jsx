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

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="bins" element={<BinListPage />} />
        <Route path="bins/:id" element={<BinDetailPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
      </Route>
    </Routes>
  )
}
