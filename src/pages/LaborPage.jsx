import { useState, useEffect, useCallback, useMemo } from 'react'
import rosterCsv from '../../docs/White Sail Roster.csv?raw'

// --- Parse roster CSV at build time ---
function parseRoster(csv) {
  const lines = csv.trim().split('\n').slice(1) // skip header
  const roster = {}
  for (const line of lines) {
    const cols = line.split(',')
    const slingName = cols[0]?.trim()
    if (!slingName || slingName === 'TOTAL') continue
    const primaryRole = cols[4]?.trim() || ''
    const flexRoles = cols[5]?.trim() || ''
    roster[slingName.toLowerCase()] = { slingName, primaryRole, flexRoles }
  }
  return roster
}

const ROSTER = parseRoster(rosterCsv)

// Name aliases: Sling may use a different name than the roster
const NAME_ALIASES = {
  'jackeline mejia': 'jacky mejia',
}

function lookupRoster(name) {
  const key = name.toLowerCase()
  if (ROSTER[key]) return ROSTER[key]
  if (NAME_ALIASES[key] && ROSTER[NAME_ALIASES[key]]) return ROSTER[NAME_ALIASES[key]]
  return null
}

// Map PRIMARY_ROLE to section
const ROLE_SECTIONS = {
  'Driver': 'Logistics',
  'Linen Production Washing': 'Washing',
  'Linen Production Pressing': 'Production',
  'Linen Production Lead': 'Production',
}

// Map flex role names to display labels
const FLEX_LABELS = {
  'Linen Production Washing': 'Washing',
  'Linen Production Pressing': 'Production',
  'Linen Production Lead': 'Production',
  'Driver': 'Logistics',
}

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
  const wages = user.wages
  if (!wages) return 0
  // 1. Try wages.base (employee base wage)
  const baseWages = wages.base
  if (Array.isArray(baseWages) && baseWages.length > 0) {
    const entry = baseWages[baseWages.length - 1]
    const rate = parseFloat(entry.regularRate)
    if (!isNaN(rate) && rate > 0 && !entry.isSalary) return rate
  }
  // 2. Try wages.positions array — per-position rates
  const positions = wages.positions
  if (Array.isArray(positions)) {
    for (const pos of positions) {
      const rate = parseFloat(pos.regularRate)
      if (!isNaN(rate) && rate > 0) return rate
    }
  }
  return 0
}

function fmt$(n) { return '$' + n.toFixed(2) }
function fmtHrs(h) { return h.toFixed(2) + 'h' }
function fmtTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function FlexBadge({ flexRoles }) {
  if (!flexRoles) return null
  const label = FLEX_LABELS[flexRoles] || flexRoles
  return (
    <span
      className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full cursor-default"
      title={`Also: ${label}`}
    >
      Flex
    </span>
  )
}

export default function LaborPage() {
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [todayTimesheets, setTodayTimesheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState('today')
  const [tick, setTick] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const { from, to } = getDateRange(dateRange)
      const today = new Date().toISOString().slice(0, 10)

      // Always fetch today's timesheets for Active Now, plus range timesheets
      const fetches = [
        fetch('/api/sling?action=concise'),
        fetch('/api/sling?action=groups'),
        fetch(`/api/sling?action=timesheets&from=${from}&to=${to}`),
      ]
      // If range isn't today, also fetch today's data separately for Active Now
      const needSeparateToday = from !== today
      if (needSeparateToday) {
        fetches.push(fetch(`/api/sling?action=timesheets&from=${today}&to=${today}`))
      }

      const responses = await Promise.all(fetches)
      const [conciseRes, groupsRes, tsRes] = responses

      if (!conciseRes.ok) throw new Error(`Users fetch failed (${conciseRes.status})`)
      if (!groupsRes.ok) throw new Error(`Groups fetch failed (${groupsRes.status})`)
      if (!tsRes.ok) throw new Error(`Timesheets fetch failed (${tsRes.status})`)

      const [conciseData, groupsData, tsData] = await Promise.all([conciseRes.json(), groupsRes.json(), tsRes.json()])

      const tsArray = Array.isArray(tsData) ? tsData : []
      const usersArray = Array.isArray(conciseData)
        ? conciseData
        : Array.isArray(conciseData?.users) ? conciseData.users : []

      let todayTs = tsArray
      if (needSeparateToday && responses[3]?.ok) {
        const todayData = await responses[3].json()
        todayTs = Array.isArray(todayData) ? todayData : []
      }

      // Debug: log full wages object for zero-rate users
      const debugIds = [10857291, 27461977, 28618190]
      const debugLabels = { 10857291: 'Dolores Molina Ayala', 27461977: 'Jacky Mejia', 28618190: 'Justin Boyd' }
      for (const id of debugIds) {
        const u = usersArray.find(u => u.id === id)
        if (u) {
          console.log(`=== WAGES DEBUG: ${debugLabels[id]} (${id}) ===`)
          console.log('Full wages object:', JSON.stringify(u.wages, null, 2))
          console.log('All top-level user keys:', Object.keys(u))
          // Log any numeric fields on the user object that might be rates
          for (const [key, val] of Object.entries(u)) {
            if (typeof val === 'number' && val > 0) console.log(`  user.${key} =`, val)
          }
        } else {
          console.log(`${debugLabels[id]} (${id}) NOT FOUND in concise. All IDs:`, usersArray.map(u => u.id))
        }
      }

      setUsers(usersArray)
      setGroups(Array.isArray(groupsData) ? groupsData : [])
      setTimesheets(tsArray)
      setTodayTimesheets(todayTs)
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

  const userMap = useMemo(() => {
    const m = {}
    users.forEach(u => {
      m[u.id] = u
      // Also index by lowercase full name for fallback matching
      const name = `${u.name || u.fname || ''} ${u.lastname || u.lname || ''}`.trim().toLowerCase()
      if (name) m[name] = u
    })
    return m
  }, [users])

  const getUserName = useCallback((ts) => {
    const userId = ts.user?.id || ts.userId
    const user = userMap[userId]
    if (user) return `${user.name || user.fname || ''} ${user.lastname || user.lname || ''}`.trim()
    if (ts.user) return `${ts.user.name || ts.user.fname || ''} ${ts.user.lastname || ts.user.lname || ''}`.trim() || 'Unknown'
    return 'Unknown'
  }, [userMap])

  // Find concise user by ID, falling back to name match
  const findUser = useCallback((ts) => {
    const userId = ts.user?.id || ts.userId
    if (userMap[userId]) return userMap[userId]
    // Fallback: match by name from timesheet
    const name = getUserName(ts).toLowerCase()
    if (name && userMap[name]) return userMap[name]
    // Try alias
    if (NAME_ALIASES[name] && userMap[NAME_ALIASES[name]]) return userMap[NAME_ALIASES[name]]
    return null
  }, [userMap, getUserName])

  // Roster-based position: use CSV as source of truth
  const getRosterEntry = useCallback((ts) => {
    const name = getUserName(ts)
    return lookupRoster(name)
  }, [getUserName])

  const getRosterPosition = useCallback((ts) => {
    const entry = getRosterEntry(ts)
    return entry ? (ROLE_SECTIONS[entry.primaryRole] || entry.primaryRole) : ''
  }, [getRosterEntry])

  // Check if a timesheet belongs to a rostered employee
  const isRostered = useCallback((ts) => {
    return !!getRosterEntry(ts)
  }, [getRosterEntry])

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // --- SECTION 1: ACTIVE NOW ---
  // An employee is active if any timesheetProjection has status === 'in_progress'
  const activeEmployees = useMemo(() => {
    const seen = new Set()
    const result = []

    for (const ts of todayTimesheets) {
      const projections = ts.timesheetProjections
      if (!Array.isArray(projections) || projections.length === 0) continue
      const isActive = projections.some(p => p.status === 'in_progress')
      if (!isActive) continue

      const userId = ts.user?.id || ts.userId
      if (!userId || seen.has(userId)) continue
      if (!isRostered(ts)) continue
      seen.add(userId)

      const user = findUser(ts)
      const entry = getRosterEntry(ts)
      const clockIn = projections[0].clockIn
      const hoursElapsed = clockIn ? Math.max(0, (now - new Date(clockIn)) / 3600000) : 0
      const rate = getPayRate(user)
      const name = getUserName(ts)
      console.log('Rate for user', name, userId, ':', rate)

      result.push({
        id: userId,
        name,
        section: ROLE_SECTIONS[entry?.primaryRole] || '',
        primaryRole: entry?.primaryRole || '',
        flexRoles: entry?.flexRoles || '',
        hours: hoursElapsed,
        cost: hoursElapsed * rate,
      })
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayTimesheets, userMap, getUserName, findUser, getRosterEntry, isRostered, today, tick])

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
      const isToday = startTime.toISOString().slice(0, 10) === today
      const isFuture = startTime > now
      const hasClockIn = ts.clockIn || ts.clockin
      if (!isToday || !isFuture || hasClockIn) return false
      if (!isRostered(ts)) return false
      const userId = ts.user?.id || ts.userId
      if (seen.has(userId)) return false
      seen.add(userId)
      return true
    }).map(ts => {
      const entry = getRosterEntry(ts)
      return {
        id: ts.user?.id || ts.userId,
        name: getUserName(ts),
        section: ROLE_SECTIONS[entry?.primaryRole] || '',
        flexRoles: entry?.flexRoles || '',
        startTime: fmtTime(ts.dtstart || ts.clockIn),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesheets, userMap, getUserName, getRosterEntry, isRostered, today])

  // --- SECTION 3: COMPLETED ---
  // Use timesheetProjections for status: completed shifts have clockIn + clockOut
  const completedShifts = useMemo(() => {
    const seen = new Set()
    const { from } = getDateRange(dateRange)
    const results = []

    for (const ts of timesheets) {
      const projections = ts.timesheetProjections
      if (!Array.isArray(projections) || projections.length === 0) continue
      // Skip if any projection is still in_progress (active, not completed)
      if (projections.some(p => p.status === 'in_progress')) continue

      const proj = projections[0]
      const clockIn = proj.clockIn
      const clockOut = proj.clockOut
      if (!clockIn || !clockOut) continue
      if (new Date(clockIn).toISOString().slice(0, 10) < from) continue
      if (!isRostered(ts)) continue

      const userId = ts.user?.id || ts.userId
      const key = `${userId}-${clockIn}`
      if (seen.has(key)) continue
      seen.add(key)

      const user = findUser(ts)
      const entry = getRosterEntry(ts)
      const hours = Math.max(0, (new Date(clockOut) - new Date(clockIn)) / 3600000)

      results.push({
        id: userId,
        name: getUserName(ts),
        section: ROLE_SECTIONS[entry?.primaryRole] || '',
        primaryRole: entry?.primaryRole || '',
        flexRoles: entry?.flexRoles || '',
        hours,
        cost: hours * getPayRate(user),
      })
    }
    return results
  }, [timesheets, userMap, getUserName, findUser, getRosterEntry, isRostered, dateRange])

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

      {/* SECTION 1: ACTIVE NOW — grouped by role */}
      <section>
        <h2 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Active Now</h2>
        {activeEmployees.length === 0 ? (
          <p className="text-gray-400 text-sm">No employees currently clocked in</p>
        ) : (
          <>
            <div className="space-y-4">
              {['Production', 'Washing', 'Logistics'].map(role => {
                const group = activeEmployees.filter(e => e.section === role)
                if (group.length === 0) return null
                const roleCost = group.reduce((sum, e) => sum + e.cost, 0)
                return (
                  <div key={role}>
                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">{role}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {group.map(emp => (
                        <div key={emp.id} className="bg-green-50 border border-green-200 rounded-lg p-3 relative">
                          <span className="absolute top-2 right-2 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                          <p className="font-semibold text-gray-900">
                            {emp.name}
                            <FlexBadge flexRoles={emp.flexRoles} />
                          </p>
                          <p className="text-xs text-gray-400">{emp.section}</p>
                          <p className="text-sm text-gray-500 mt-1">{fmtHrs(emp.hours)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-green-700 text-right">{role} subtotal: {fmt$(roleCost)}</p>
                  </div>
                )
              })}
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
                    <p className="font-medium text-gray-900">
                      {shift.name}
                      <FlexBadge flexRoles={shift.flexRoles} />
                    </p>
                    <p className="text-xs text-gray-400">{shift.section}</p>
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
                    <p className="font-medium text-gray-900">
                      {shift.name}
                      <FlexBadge flexRoles={shift.flexRoles} />
                    </p>
                    <p className="text-xs text-gray-400">{shift.section}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-700">{fmtHrs(shift.hours)}</p>
                    <p className="text-xs text-gray-500">{fmt$(shift.cost)}</p>
                  </div>
                </div>
              ))}
            </div>

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
