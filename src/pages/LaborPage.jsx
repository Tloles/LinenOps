import { useState, useEffect, useCallback, useMemo } from 'react'

const DATE_RANGES = ['today', 'week', 'month']

function getDateRange(range) {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)

  if (range === 'today') return { from: to, to }

  if (range === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - diff)
    return { from: monday.toISOString().slice(0, 10), to }
  }

  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: first.toISOString().slice(0, 10), to }
}

function getPayRate(user) {
  if (!user) return 0
  const baseWages = user.wages?.base
  if (Array.isArray(baseWages) && baseWages.length > 0) {
    const rate = parseFloat(baseWages[baseWages.length - 1].regularRate)
    if (!isNaN(rate) && !baseWages[baseWages.length - 1].isSalary) return rate
  }
  return user?.hourlyRate || user?.wage || 0
}

function fmt$(n) {
  return '$' + n.toFixed(2)
}

function fmtHrs(h) {
  return h.toFixed(2) + 'h'
}

function fmtTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function LaborPage() {
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [clockedIn, setClockedIn] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState('today')
  const [tick, setTick] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const { from, to } = getDateRange(dateRange)
      const [conciseRes, groupsRes, tsRes, clockinRes] = await Promise.all([
        fetch('/api/sling?action=concise'),
        fetch('/api/sling?action=groups'),
        fetch(`/api/sling?action=timesheets&from=${from}&to=${to}`),
        fetch('/api/sling?action=currentclockin'),
      ])

      if (!conciseRes.ok) throw new Error(`Users fetch failed (${conciseRes.status})`)
      if (!groupsRes.ok) throw new Error(`Groups fetch failed (${groupsRes.status})`)
      if (!tsRes.ok) throw new Error(`Timesheets fetch failed (${tsRes.status})`)

      const [conciseData, groupsData, tsData] = await Promise.all([conciseRes.json(), groupsRes.json(), tsRes.json()])

      const tsArray = Array.isArray(tsData) ? tsData : []
      if (tsArray.length > 0) {
        console.log('First timesheet entry:', JSON.stringify(tsArray[0], null, 2))
      }

      const usersArray = Array.isArray(conciseData)
        ? conciseData
        : Array.isArray(conciseData?.users)
        ? conciseData.users
        : []

      let clockinData = []
      if (clockinRes.ok) {
        const raw = await clockinRes.json()
        clockinData = Array.isArray(raw) ? raw : []
      }

      setUsers(usersArray)
      setGroups(Array.isArray(groupsData) ? groupsData : [])
      setTimesheets(tsArray)
      setClockedIn(clockinData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    setLoading(true)
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const groupMap = useMemo(() => {
    const m = {}
    groups.forEach(g => { m[g.id] = g.name || '' })
    return m
  }, [groups])

  const userMap = useMemo(() => {
    const m = {}
    users.forEach(u => { m[u.id] = u })
    return m
  }, [users])

  const getUserPosition = useCallback((userId, ts) => {
    if (ts?.position?.name) return ts.position.name
    if (ts?.positionName) return ts.positionName
    const user = userMap[userId]
    if (!user) return ''
    if (user.position?.name) return user.position.name
    if (typeof user.position === 'string' && user.position) return user.position
    const gIds = user.groups || user.groupIds || []
    const names = gIds.map(id => groupMap[id] || '').filter(Boolean)
    if (names.length) return names.join(', ')
    if (user.title) return user.title
    return ''
  }, [userMap, groupMap])

  const getUserName = useCallback((ts) => {
    const userId = ts.user?.id || ts.userId
    const user = userMap[userId]
    if (user) {
      return `${user.name || user.fname || ''} ${user.lastname || user.lname || ''}`.trim()
    }
    if (ts.user) {
      return `${ts.user.name || ts.user.fname || ''} ${ts.user.lastname || ts.user.lname || ''}`.trim() || 'Unknown'
    }
    return 'Unknown'
  }, [userMap])

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // --- SECTION 1: ACTIVE NOW ---
  // Deduplicate by userId — one entry per person
  const activeEmployees = useMemo(() => {
    const seen = new Set()
    const result = []

    // Prefer clockedIn data, fallback to open timesheet punches
    const source = clockedIn.length > 0
      ? clockedIn
      : timesheets.filter(ts => {
          const start = ts.dtstart || ts.clockIn
          if (!start) return false
          const hasEnd = ts.dtend || ts.clockOut
          return new Date(start).toISOString().slice(0, 10) === today && !hasEnd
        })

    for (const ts of source) {
      const userId = ts.user?.id || ts.userId
      if (!userId || seen.has(userId)) continue
      seen.add(userId)

      const user = userMap[userId]
      const start = ts.dtstart || ts.clockIn
      const hoursElapsed = start ? Math.max(0, (now - new Date(start)) / 3600000) : 0

      result.push({
        id: userId,
        name: getUserName(ts),
        position: getUserPosition(userId, ts),
        hours: hoursElapsed,
        cost: hoursElapsed * getPayRate(user),
      })
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockedIn, timesheets, userMap, getUserName, getUserPosition, today, tick])

  const activeTotalCost = useMemo(() => {
    return activeEmployees.reduce((sum, e) => sum + e.cost, 0)
  }, [activeEmployees])

  // --- SECTION 2: SCHEDULED ---
  const scheduledShifts = useMemo(() => {
    const seen = new Set()
    return timesheets.filter(ts => {
      const start = ts.dtstart || ts.clockIn
      if (!start) return false
      const startTime = new Date(start)
      // Future shift today, not yet clocked in
      const isToday = startTime.toISOString().slice(0, 10) === today
      const isFuture = startTime > now
      const hasClockIn = ts.clockIn || ts.clockin
      if (!isToday || !isFuture || hasClockIn) return false
      // Deduplicate
      const userId = ts.user?.id || ts.userId
      if (seen.has(userId)) return false
      seen.add(userId)
      return true
    }).map(ts => ({
      id: ts.user?.id || ts.userId,
      name: getUserName(ts),
      position: getUserPosition(ts.user?.id || ts.userId, ts),
      startTime: fmtTime(ts.dtstart || ts.clockIn),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesheets, userMap, getUserName, getUserPosition, today])

  // --- SECTION 3: COMPLETED ---
  const completedShifts = useMemo(() => {
    const seen = new Set()
    return timesheets.filter(ts => {
      const start = ts.dtstart || ts.clockIn
      const end = ts.dtend || ts.clockOut
      if (!start || !end) return false
      const isInRange = new Date(start).toISOString().slice(0, 10) >= getDateRange(dateRange).from
      if (!isInRange) return false
      // Deduplicate by unique shift (userId + start time)
      const userId = ts.user?.id || ts.userId
      const key = `${userId}-${start}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(ts => {
      const userId = ts.user?.id || ts.userId
      const user = userMap[userId]
      const start = new Date(ts.dtstart || ts.clockIn)
      const end = new Date(ts.dtend || ts.clockOut)
      const hours = Math.max(0, (end - start) / 3600000)
      return {
        id: userId,
        name: getUserName(ts),
        position: getUserPosition(userId, ts),
        hours,
        cost: hours * getPayRate(user),
      }
    })
  }, [timesheets, userMap, getUserName, getUserPosition, dateRange])

  const completedTotals = useMemo(() => {
    const uniqueIds = new Set(completedShifts.map(s => s.id))
    return {
      headcount: uniqueIds.size,
      totalHours: completedShifts.reduce((sum, s) => sum + s.hours, 0),
      totalCost: completedShifts.reduce((sum, s) => sum + s.cost, 0),
    }
  }, [completedShifts])

  if (loading && timesheets.length === 0) {
    return <div className="text-center py-12 text-gray-400">Loading labor data...</div>
  }

  return (
    <div className="space-y-5 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-[28px] font-bold text-[#1e3a5f]">Labor</h1>
        <div className="flex items-center gap-2">
          <div className="bg-gray-100 rounded-lg p-0.5 flex">
            {DATE_RANGES.map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
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

      {/* SECTION 1: ACTIVE NOW */}
      <section>
        <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Active Now</h2>
        {activeEmployees.length === 0 ? (
          <p className="text-gray-400 text-sm">No employees currently clocked in</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeEmployees.map(emp => (
                <div key={emp.id} className="bg-green-50 border border-green-200 rounded-lg p-3 relative">
                  <span className="absolute top-2 right-2 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                  <p className="font-semibold text-gray-900">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.position}</p>
                  <p className="text-sm text-gray-500 mt-1">{fmtHrs(emp.hours)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 bg-green-100 border border-green-300 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-green-800">
                {activeEmployees.length} employee{activeEmployees.length !== 1 ? 's' : ''} active
              </span>
              <span className="text-lg font-bold text-green-900">{fmt$(activeTotalCost)} so far</span>
            </div>
          </>
        )}
      </section>

      {/* SECTION 2: SCHEDULED */}
      {dateRange === 'today' && (
        <section>
          <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Scheduled</h2>
          {scheduledShifts.length === 0 ? (
            <p className="text-gray-400 text-sm">No upcoming shifts today</p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200">
              {scheduledShifts.map((shift, i) => (
                <div key={shift.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div>
                    <p className="font-medium text-gray-900">{shift.name}</p>
                    <p className="text-xs text-gray-400">{shift.position}</p>
                  </div>
                  <span className="text-sm text-gray-500">{shift.startTime}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: COMPLETED */}
      <section>
        <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">
          Completed {dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This Week' : 'This Month'}
        </h2>
        {completedShifts.length === 0 ? (
          <p className="text-gray-400 text-sm">No completed shifts</p>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200">
              {completedShifts.map((shift, i) => (
                <div key={`${shift.id}-${i}`} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div>
                    <p className="font-medium text-gray-900">{shift.name}</p>
                    <p className="text-xs text-gray-400">{shift.position}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-700">{fmtHrs(shift.hours)}</p>
                    <p className="text-xs text-gray-500">{fmt$(shift.cost)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals row */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-blue-400 p-4">
                <p className="text-sm text-gray-500">Headcount</p>
                <p className="text-2xl font-bold text-gray-900">{completedTotals.headcount}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-green-400 p-4">
                <p className="text-sm text-gray-500">Total Hours</p>
                <p className="text-2xl font-bold text-gray-900">{fmtHrs(completedTotals.totalHours)}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-amber-400 p-4">
                <p className="text-sm text-gray-500">Total Labor Cost</p>
                <p className="text-2xl font-bold text-gray-900">{fmt$(completedTotals.totalCost)}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
