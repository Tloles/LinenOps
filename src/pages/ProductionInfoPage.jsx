import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import CustomerLogo from '../components/CustomerLogo'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getProdDayStart() {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const nowUTC = new Date()
  const etOffsetMs = nowUTC.getTime() - nowET.getTime()

  const fiveAMToday = new Date(nowET)
  fiveAMToday.setHours(5, 0, 0, 0)
  const fiveAMTodayUTC = new Date(fiveAMToday.getTime() + etOffsetMs)

  const prodDayStart = nowUTC >= fiveAMTodayUTC
    ? fiveAMTodayUTC
    : new Date(fiveAMTodayUTC.getTime() - 24 * 60 * 60 * 1000)

  return prodDayStart.toISOString()
}

function getThreeDayNames() {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const nowUTC = new Date()
  const etOffsetMs = nowUTC.getTime() - nowET.getTime()

  const fiveAMToday = new Date(nowET)
  fiveAMToday.setHours(5, 0, 0, 0)
  const fiveAMTodayUTC = new Date(fiveAMToday.getTime() + etOffsetMs)

  // If before 5 AM, the production day started yesterday
  const prodDayET = nowUTC >= fiveAMTodayUTC ? nowET : new Date(nowET.getTime() - 24 * 60 * 60 * 1000)

  const days = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(prodDayET)
    d.setDate(prodDayET.getDate() + i)
    days.push(DAY_NAMES[d.getDay()])
  }
  return days
}

function statusInfo(hasInProcess, hasLog) {
  if (!hasInProcess && !hasLog) return { emoji: '\u{1F534}', label: 'Not Started', color: 'border-red-300 bg-red-50' }
  if (hasInProcess && !hasLog) return { emoji: '\u{1F7E1}', label: 'Washing', color: 'border-yellow-300 bg-yellow-50' }
  if (hasInProcess && hasLog) return { emoji: '\u{1F7E0}', label: 'Producing', color: 'border-orange-300 bg-orange-50' }
  return { emoji: '\u{1F7E2}', label: 'Ready', color: 'border-green-300 bg-green-50' }
}

function LbsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-100 px-4 py-3">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-gray-900">
        {Number(payload[0].value).toLocaleString()} lbs
      </p>
    </div>
  )
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
}

function formatHourLabel(hour) {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour < 12) return hour + ' AM'
  return (hour - 12) + ' PM'
}

export default function ProductionInfoPage() {
  const [loading, setLoading] = useState(true)
  const [dayCustomers, setDayCustomers] = useState([[], [], []]) // [today, tomorrow, dayAfter]
  const [inProcessBins, setInProcessBins] = useState([])
  const [prodLogs, setProdLogs] = useState([])
  const [dayNames, setDayNames] = useState(['', '', ''])

  const fetchAll = useCallback(async () => {
    const prodDayStartISO = getProdDayStart()
    const threeDays = getThreeDayNames()
    setDayNames(threeDays)

    const [routesRes, binsRes, logsRes] = await Promise.all([
      supabase
        .from('routes')
        .select('id, name, day_of_week, route_stops(id, customers(id, name, logo_url), locations(id, name, customers(id, name, logo_url)))')
        .in('day_of_week', threeDays),
      supabase
        .from('bins')
        .select('id, customer_id')
        .eq('current_status', 'in_process'),
      supabase
        .from('production_logs')
        .select('id, customer_id, linen_weight, created_at, customers(id, name, logo_url)')
        .gte('created_at', prodDayStartISO)
        .order('created_at', { ascending: true }),
    ])

    // Extract unique customers per day
    const routes = routesRes.data || []
    const perDay = threeDays.map(dayName => {
      const dayRoutes = routes.filter(r => r.day_of_week === dayName)
      const customerMap = new Map()
      for (const route of dayRoutes) {
        for (const stop of (route.route_stops || [])) {
          const cust = stop.customers || stop.locations?.customers
          if (cust && cust.id) {
            if (!customerMap.has(cust.id)) {
              customerMap.set(cust.id, { ...cust, routeName: `${route.day_of_week} — ${route.name}` })
            }
          }
        }
      }
      return [...customerMap.values()]
    })

    setDayCustomers(perDay)
    setInProcessBins(binsRes.data || [])
    setProdLogs(logsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // Status for today's customers
  const todayWithStatus = useMemo(() => {
    return dayCustomers[0].map(cust => {
      const hasInProcess = inProcessBins.some(b => b.customer_id === cust.id)
      const custLogs = prodLogs.filter(l => l.customer_id === cust.id)
      const hasLog = custLogs.length > 0
      const lbsToday = custLogs.reduce((s, l) => s + (l.linen_weight || 0), 0)
      const status = statusInfo(hasInProcess, hasLog)
      return { ...cust, ...status, lbsToday, hasInProcess, hasLog }
    })
  }, [dayCustomers, inProcessBins, prodLogs])

  // Timeline
  const timeline = useMemo(() => {
    return prodLogs.map(log => ({
      id: log.id,
      time: formatTime(log.created_at),
      customerName: log.customers?.name || 'Unknown',
      logoUrl: log.customers?.logo_url,
      lbs: log.linen_weight || 0,
    }))
  }, [prodLogs])

  // Lbs per hour chart data
  const lbsPerHour = useMemo(() => {
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const currentHour = nowET.getHours()

    // Group logs by hour (ET)
    const hourBuckets = {}
    for (const log of prodLogs) {
      const d = new Date(new Date(log.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const h = d.getHours()
      hourBuckets[h] = (hourBuckets[h] || 0) + (log.linen_weight || 0)
    }

    // Fill from 5 AM to current hour
    const data = []
    const startHour = 5
    const endHour = currentHour < startHour ? startHour : currentHour
    for (let h = startHour; h <= endHour; h++) {
      data.push({ hour: formatHourLabel(h), lbs: hourBuckets[h] || 0 })
    }
    return data
  }, [prodLogs])

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading production info...</div>
  }

  const dayLabels = ['Today', 'Tomorrow', 'Day After']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Production Info</h2>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-3 py-1">
          Auto-refreshes every 60s
        </span>
      </div>

      {/* Rolling 3-Day Queue */}
      <div className="space-y-5">
        <h3 className="text-md font-semibold text-gray-800">Rolling 3-Day Queue</h3>

        {dayLabels.map((label, dayIdx) => {
          const customers = dayIdx === 0 ? todayWithStatus : dayCustomers[dayIdx]
          return (
            <div key={label}>
              <h4 className="text-sm font-semibold text-gray-600 mb-2">
                {label} — {dayNames[dayIdx]}
              </h4>
              {customers.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No customers scheduled</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customers.map(cust => (
                    <div
                      key={cust.id}
                      className={`rounded-lg border p-3 ${
                        dayIdx === 0
                          ? cust.color
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {dayIdx === 0 && (
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {cust.emoji} {cust.label}
                          </span>
                          <span className="text-sm font-bold text-gray-700">
                            {cust.lbsToday} lbs
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <CustomerLogo url={cust.logo_url} name={cust.name} size={32} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{cust.name}</div>
                          <div className="text-xs text-gray-500 truncate">Route: {cust.routeName}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Today's Timeline */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-gray-800">Today's Timeline</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No production logs yet today</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {timeline.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-medium text-gray-500 w-20 shrink-0">{entry.time}</span>
                <CustomerLogo url={entry.logoUrl} name={entry.customerName} size={28} />
                <span className="text-sm font-medium text-gray-900 truncate flex-1">{entry.customerName}</span>
                <span className="text-sm font-bold text-gray-700">{entry.lbs} lbs</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lbs Per Hour Chart */}
      {lbsPerHour.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h4 className="text-sm font-semibold text-gray-800 mb-5">Lbs Per Hour</h4>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={lbsPerHour}>
              <defs>
                <linearGradient id="gradNavyLine" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#1e3a5f" stopOpacity={1} />
                </linearGradient>
                <linearGradient id="gradNavyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => v + ' lbs'} />
              <Tooltip content={<LbsTooltip />} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="lbs"
                stroke="url(#gradNavyLine)"
                strokeWidth={2.5}
                fill="url(#gradNavyFill)"
                dot={{ r: 3, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
