import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import CustomerLogo from '../components/CustomerLogo'

export default function DriverRoutePage() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const [route, setRoute] = useState(null)
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [routeId])

  async function fetchData() {
    setLoading(true)

    // Fetch route with stops — try with locations join, fallback without
    let routeRes = await supabase
      .from('routes')
      .select('*, route_stops(*, customers(id, name, address, logo_url), locations(id, name, weekly_par, deliveries_per_week, customers(id, name, address, logo_url)))')
      .eq('id', routeId)
      .single()

    if (routeRes.error) {
      console.warn('[DriverRoute] Full query failed, falling back without locations:', routeRes.error.message)
      routeRes = await supabase
        .from('routes')
        .select('*, route_stops(*, customers(id, name, address, logo_url))')
        .eq('id', routeId)
        .single()
    }

    const progressRes = await supabase
      .from('route_progress')
      .select('stop_id')
      .eq('route_id', routeId)
      .eq('date', new Date().toISOString().split('T')[0])

    if (routeRes.error) {
      console.error('[DriverRoute] fetch error:', routeRes.error)
    }
    if (progressRes.error) {
      console.error('[DriverRoute] progress error:', progressRes.error)
    }

    if (routeRes.data) {
      setRoute({
        ...routeRes.data,
        route_stops: (routeRes.data.route_stops || []).sort((a, b) => a.stop_order - b.stop_order),
      })
    }

    const completedSet = {}
    for (const row of progressRes.data || []) {
      completedSet[row.stop_id] = true
    }
    setProgress(completedSet)
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading route...</div>
  }

  if (!route) {
    return <div className="text-center py-8 text-red-500">Route not found.</div>
  }

  const firstIncompleteIdx = route.route_stops.findIndex((s) => !progress[s.id])
  const allComplete = firstIncompleteIdx === -1 && route.route_stops.length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/routes/today')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">{route.name}</h2>
      </div>

      {/* Stop list */}
      {route.route_stops.map((stop, idx) => {
        const isCompleted = !!progress[stop.id]
        const isCurrent = idx === firstIncompleteIdx
        const isLocation = !!stop.location_id

        const name = isLocation ? stop.locations?.name : stop.customers?.name
        const address = isLocation ? stop.locations?.customers?.address : stop.customers?.address
        const logoUrl = isLocation ? stop.locations?.customers?.logo_url : stop.customers?.logo_url
        const logoName = isLocation ? stop.locations?.customers?.name : stop.customers?.name
        const subtitle = isLocation ? stop.locations?.customers?.name : null

        // Wellness par info for display
        const location = stop.locations
        const deliveryPar = location
          ? Math.ceil(location.weekly_par / location.deliveries_per_week)
          : null

        return (
          <div
            key={stop.id}
            className={`bg-white rounded-lg border-2 p-4 flex items-center gap-3 ${
              isCompleted
                ? 'border-green-200 bg-green-50/50'
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
                {address && !isLocation && (
                  <p className="text-sm text-gray-500 truncate">{address}</p>
                )}
                {isLocation && deliveryPar !== null && (
                  <p className="text-sm text-blue-600 font-medium">Par: {deliveryPar} per delivery</p>
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

      {allComplete && (
        <div className="text-center py-4 text-green-700 font-medium bg-green-50 rounded-lg border border-green-200">
          All stops completed!
        </div>
      )}

      {route.route_stops.length === 0 && (
        <p className="text-gray-500 text-center py-8">This route has no stops.</p>
      )}
    </div>
  )
}
