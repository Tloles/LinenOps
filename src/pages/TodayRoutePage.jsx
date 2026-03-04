import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { isRouteToday } from '../lib/routes'
import CustomerLogo from '../components/CustomerLogo'

export default function TodayRoutePage() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)

    const [routesRes, progressRes] = await Promise.all([
      supabase
        .from('routes')
        .select('*, route_stops(*, customers(id, name, address, logo_url), locations(id, name, weekly_par, deliveries_per_week, customers(id, name, address, logo_url)))')
        .order('created_at', { ascending: true }),
      supabase
        .from('route_progress')
        .select('stop_id')
        .eq('date', new Date().toISOString().split('T')[0]),
    ])

    if (routesRes.error) {
      console.error('Error fetching routes:', routesRes.error)
    }
    if (progressRes.error) {
      console.error('Error fetching progress:', progressRes.error)
    }

    const allRoutes = (routesRes.data || [])
      .filter((r) => isRouteToday(r.schedule))
      .map((r) => ({
        ...r,
        route_stops: (r.route_stops || []).sort((a, b) => a.stop_order - b.stop_order),
      }))

    const completedSet = {}
    for (const row of progressRes.data || []) {
      completedSet[row.stop_id] = true
    }

    setRoutes(allRoutes)
    setProgress(completedSet)
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading today's routes...</div>
  }

  if (routes.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Today's Route</h2>
        <p className="text-gray-500 text-center py-8">No routes scheduled for today.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Today's Route</h2>

      {routes.map((route) => {
        const firstIncompleteIdx = route.route_stops.findIndex(
          (s) => !progress[s.id]
        )

        return (
          <div key={route.id} className="space-y-2">
            <h3 className="text-base font-semibold text-gray-700">{route.name}</h3>

            {route.route_stops.map((stop, idx) => {
              const isCompleted = !!progress[stop.id]
              const isCurrent = idx === firstIncompleteIdx
              const isLocation = !!stop.location_id

              const name = isLocation ? stop.locations?.name : stop.customers?.name
              const address = isLocation ? stop.locations?.customers?.address : stop.customers?.address
              const logoUrl = isLocation ? stop.locations?.customers?.logo_url : stop.customers?.logo_url
              const logoName = isLocation ? stop.locations?.customers?.name : stop.customers?.name
              const subtitle = isLocation ? stop.locations?.customers?.name : null

              return (
                <div
                  key={stop.id}
                  className={`bg-white rounded-lg border-2 p-4 flex items-center gap-3 transition-opacity ${
                    isCompleted
                      ? 'border-green-200 bg-green-50'
                      : isCurrent
                        ? 'border-blue-400'
                        : 'border-gray-200 opacity-50'
                  }`}
                >
                  {/* Number / checkmark badge */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>

                  {/* Stop info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <CustomerLogo url={logoUrl} name={logoName} size={48} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{name}</p>
                        {isLocation && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">Wellness</span>
                        )}
                      </div>
                      {subtitle && (
                        <p className="text-xs text-gray-400 truncate">{subtitle}</p>
                      )}
                      {address && (
                        <p className="text-sm text-gray-500 truncate">{address}</p>
                      )}
                    </div>
                  </div>

                  {/* Action button */}
                  {isCurrent && (
                    <button
                      onClick={() => navigate(`/routes/today/${route.id}/stops/${stop.id}`)}
                      className="min-h-[44px] px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shrink-0"
                    >
                      Start Stop
                    </button>
                  )}
                </div>
              )
            })}

            {firstIncompleteIdx === -1 && route.route_stops.length > 0 && (
              <div className="text-center py-3 text-green-700 font-medium bg-green-50 rounded-lg border border-green-200">
                All stops completed!
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
