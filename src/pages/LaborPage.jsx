import { useState, useEffect, useCallback, useMemo } from 'react'

const DATE_RANGES = ['today', 'week', 'month']

function getDateRange(range) {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)

  if (range === 'today') return { from: to, to }

  if (range === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1 // Monday = 0
    const monday = new Date(now)
    monday.setDate(now.getDate() - diff)
    return { from: monday.toISOString().slice(0, 10), to }
  }

  // month
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: first.toISOString().slice(0, 10), to }
}

function getHours(ts, tick) {
  const start = new Date(ts.dtStart || ts.clockIn)
  const end = ts.dtEnd || ts.clockOut ? new Date(ts.dtEnd || ts.clockOut) : new Date()
  // tick is used to force re-render for live updates
  void tick
  return Math.max(0, (end - start) / 3600000)
}

// Pay rate from Sling user data — fallback to 0
// If Sling doesn't expose rates, hardcode per position here
function getPayRate(user) {
  return user?.hourlyRate || user?.wage || 0
}

function fmt$(n) {
  return '$' + n.toFixed(2)
}

function fmtHrs(h) {
  return h.toFixed(2) + 'h'
}

const ROLES = [
  { key: 'logistics', label: 'Logistics', emoji: '🚛', match: p => /driver/i.test(p) },
  { key: 'washing', label: 'Washing', emoji: '🫧', match: p => /linen production washing/i.test(p) },
  { key: 'production', label: 'Production', emoji: '⚙️', match: p => /linen production pressing/i.test(p) || /linen production lead/i.test(p) },
]

export default function LaborPage() {
  const [users, setUsers] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState('today')
  const [tick, setTick] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const { from, to } = getDateRange(dateRange)
      const [usersRes, tsRes] = await Promise.all([
        fetch('/api/sling?action=users'),
        fetch(`/api/sling?action=timesheets&from=${from}&to=${to}`),
      ])

      if (!usersRes.ok) throw new Error(`Users fetch failed (${usersRes.status})`)
      if (!tsRes.ok) throw new Error(`Timesheets fetch failed (${tsRes.status})`)

      const [usersData, tsData] = await Promise.all([usersRes.json(), tsRes.json()])
      setUsers(Array.isArray(usersData) ? usersData : [])
      setTimesheets(Array.isArray(tsData) ? tsData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  // Auto-refresh every 60s
  useEffect(() => {
    setLoading(true)
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  // 1-second tick for live Active Now hours
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const userMap = useMemo(() => {
    const m = {}
    users.forEach(u => { m[u.id] = u })
    return m
  }, [users])

  const today = new Date().toISOString().slice(0, 10)

  const activeTimesheets = useMemo(() => {
    return timesheets.filter(ts => {
      const start = ts.dtStart || ts.clockIn
      if (!start) return false
      const startDate = new Date(start).toISOString().slice(0, 10)
      const hasEnd = ts.dtEnd || ts.clockOut
      return startDate === today && !hasEnd
    })
  }, [timesheets, today])

  const getUserPosition = useCallback((userId) => {
    const user = userMap[userId]
    return user?.type || user?.position || user?.role || ''
  }, [userMap])

  const getUserName = useCallback((ts) => {
    const user = userMap[ts.user?.id || ts.userId]
    if (user) return `${user.name || user.fname || ''} ${user.lname || ''}`.trim()
    return ts.user?.name || 'Unknown'
  }, [userMap])

  const roleData = useMemo(() => {
    return ROLES.map(role => {
      const roleTimesheets = timesheets.filter(ts => {
        const userId = ts.user?.id || ts.userId
        const pos = getUserPosition(userId)
        return role.match(pos)
      })

      const employees = roleTimesheets.map(ts => {
        const userId = ts.user?.id || ts.userId
        const user = userMap[userId]
        const hours = getHours(ts, tick)
        const rate = getPayRate(user)
        return {
          id: userId,
          name: getUserName(ts),
          position: getUserPosition(userId),
          hours,
          rate,
          cost: hours * rate,
        }
      })

      return { ...role, employees }
    })
  }, [timesheets, userMap, getUserPosition, getUserName, tick])

  const totals = useMemo(() => {
    const allEmployees = roleData.flatMap(r => r.employees)
    const uniqueIds = new Set(allEmployees.map(e => e.id))
    return {
      headcount: uniqueIds.size,
      totalHours: allEmployees.reduce((sum, e) => sum + e.hours, 0),
      totalCost: allEmployees.reduce((sum, e) => sum + e.cost, 0),
    }
  }, [roleData])

  if (loading && timesheets.length === 0) {
    return <div className="text-center py-12 text-gray-400">Loading labor data...</div>
  }

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-[28px] font-bold text-[#1e3a5f]">Labor</h1>
        <div className="flex items-center gap-2">
          <div className="bg-gray-100 rounded-lg p-0.5 flex">
            {DATE_RANGES.map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  dateRange === r
                    ? 'bg-white text-[#1e3a5f] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">Auto-refreshes every 60s</span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-lg">{error}</div>
      )}

      {/* Active Now */}
      <section>
        <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Active Now</h2>
        {activeTimesheets.length === 0 ? (
          <p className="text-gray-400 text-sm">No employees currently clocked in</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeTimesheets.map((ts, i) => {
              const userId = ts.user?.id || ts.userId
              const user = userMap[userId]
              const hours = getHours(ts, tick)
              const rate = getPayRate(user)
              return (
                <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-3 relative">
                  <span className="absolute top-2 right-2 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                  <p className="font-semibold text-gray-900">{getUserName(ts)}</p>
                  <p className="text-sm text-gray-500 mt-1">{fmtHrs(hours)}</p>
                  <p className="text-sm font-medium text-green-700">{fmt$(hours * rate)}</p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* By Role */}
      <section>
        <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">By Role</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {roleData.map(role => (
            <div key={role.key} className="bg-white rounded-lg border border-gray-200 p-3">
              <h3 className="text-base font-bold text-gray-800 mb-2">
                {role.emoji} {role.label}
              </h3>
              {role.employees.length === 0 ? (
                <p className="text-sm text-gray-400">No timesheets</p>
              ) : (
                <div className="space-y-2">
                  {role.employees.map((emp, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-gray-100 pb-1.5 last:border-0">
                      <div>
                        <p className="font-medium text-gray-900">{emp.name}</p>
                        <p className="text-xs text-gray-400">{emp.position}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-700">{fmtHrs(emp.hours)}</p>
                        <p className="text-xs text-gray-400">
                          {emp.rate > 0 ? `${fmt$(emp.rate)}/hr · ${fmt$(emp.cost)}` : fmtHrs(emp.hours)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Totals Bar */}
      <section>
        <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Totals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-blue-400 p-4">
            <p className="text-sm text-gray-500">Headcount</p>
            <p className="text-2xl font-bold text-gray-900">{totals.headcount}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-green-400 p-4">
            <p className="text-sm text-gray-500">Total Hours</p>
            <p className="text-2xl font-bold text-gray-900">{fmtHrs(totals.totalHours)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-amber-400 p-4">
            <p className="text-sm text-gray-500">Total Labor Cost</p>
            <p className="text-2xl font-bold text-gray-900">{fmt$(totals.totalCost)}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
