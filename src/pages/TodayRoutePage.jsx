import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { DAYS_OF_WEEK, getTodayDayOfWeek } from '../lib/routes'

export default function TodayRoutePage() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)

  const today = getTodayDayOfWeek()
  const todayLabel = DAYS_OF_WEEK.find((d) => d.value === today)?.label || today

  useEffect(() => {
    fetchRoutes()
  }, [])

  async function fetchRoutes() {
    setLoading(true)

    const { data, error } = await supabase
      .from('routes')
      .select('id, name, day_of_week')
      .eq('day_of_week', today)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[TodayRoute] fetchRoutes error:', error)
    }

    setRoutes(data || [])
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading today's routes...</div>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Today's Routes</h2>
      <p className="text-sm text-gray-500">{todayLabel}</p>

      {routes.length === 0 && (
        <p className="text-gray-500 text-center py-12">No routes scheduled for today.</p>
      )}

      {routes.map((route) => (
        <button
          key={route.id}
          onClick={() => navigate(`/routes/today/${route.id}`)}
          className="w-full bg-white rounded-xl border-2 border-gray-200 p-6 text-left hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 transition-colors"
        >
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{todayLabel}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{route.name}</p>
        </button>
      ))}
    </div>
  )
}
