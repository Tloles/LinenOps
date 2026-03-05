import { useEffect, useState, useCallback } from 'react'
import { WashingMachine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import CustomerLogo from '../components/CustomerLogo'

function utilizationIconColor(pct) {
  if (pct >= 80) return 'text-rose-500'
  if (pct >= 50) return 'text-amber-500'
  return 'text-green-500'
}

function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function utilizationColor(pct) {
  if (pct >= 80) return 'bg-rose-100 border-rose-300 text-rose-800'
  if (pct >= 50) return 'bg-amber-50 border-amber-300 text-amber-800'
  return 'bg-green-50 border-green-300 text-green-800'
}

export default function WashInfoPage() {
  const today = toLocalDateStr(new Date())

  const [washers, setWashers] = useState([])
  const [customers, setCustomers] = useState([])
  const [cycles, setCycles] = useState([])

  // Filters
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterWasher, setFilterWasher] = useState('')

  // Data
  const [logs, setLogs] = useState([])
  const [todayLogs, setTodayLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRef() {
      const [w, cu, cy] = await Promise.all([
        supabase.from('washers').select('*').order('name'),
        supabase.from('customers').select('id, name, logo_url').order('name'),
        supabase.from('wash_cycles').select('*').order('name'),
      ])
      if (w.data) setWashers(w.data)
      if (cu.data) setCustomers(cu.data)
      if (cy.data) setCycles(cy.data)
    }
    fetchRef()
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)

    // Build date range — end date is inclusive, so add 1 day
    const rangeStart = new Date(startDate + 'T00:00:00')
    const rangeEnd = new Date(endDate + 'T00:00:00')
    rangeEnd.setDate(rangeEnd.getDate() + 1)

    let query = supabase
      .from('wash_logs')
      .select('id, weight_lbs, washer_id, customer_id, wash_cycle_id, created_at, customers(id, name, logo_url), washers(id, name, capacity, capacity_lbs), wash_cycles(id, name)')
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: false })

    if (filterCustomer) query = query.eq('customer_id', filterCustomer)
    if (filterWasher) query = query.eq('washer_id', filterWasher)

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }, [startDate, endDate, filterCustomer, filterWasher])

  // Fetch today's logs (unfiltered) for washer utilization
  const fetchTodayLogs = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)

    const { data } = await supabase
      .from('wash_logs')
      .select('id, weight_lbs, washer_id')
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', todayEnd.toISOString())

    setTodayLogs(data || [])
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetchTodayLogs()
  }, [fetchTodayLogs])

  // Summary stats
  const totalLoads = logs.length
  const totalLbs = logs.reduce((s, l) => s + Number(l.weight_lbs), 0)
  const avgLbs = totalLoads > 0 ? Math.round(totalLbs / totalLoads) : 0

  // Washer utilization (today only, unfiltered)
  const washerUtil = washers.map(w => {
    const wLogs = todayLogs.filter(l => l.washer_id === w.id)
    const loads = wLogs.length
    const lbs = wLogs.reduce((s, l) => s + Number(l.weight_lbs), 0)
    // Utilization = total lbs / capacity (one load worth). Higher = more loads run.
    const cap = w.capacity_lbs || w.capacity || 0
    const pct = cap > 0 ? Math.round((lbs / cap) * 100) : 0
    return { ...w, loads, lbs, pct }
  })

  // By customer (filtered range)
  const custMap = {}
  for (const log of logs) {
    const cid = log.customer_id
    if (!custMap[cid]) {
      custMap[cid] = {
        id: cid,
        name: log.customers?.name || 'Unknown',
        logo_url: log.customers?.logo_url,
        loads: 0,
        lbs: 0,
      }
    }
    custMap[cid].loads++
    custMap[cid].lbs += Number(log.weight_lbs)
  }
  const customerSummary = Object.values(custMap).sort((a, b) => b.lbs - a.lbs)

  // By cycle (filtered range)
  const cycleMap = {}
  for (const log of logs) {
    const cid = log.wash_cycle_id
    if (!cycleMap[cid]) {
      cycleMap[cid] = {
        id: cid,
        name: log.wash_cycles?.name || 'Unknown',
        loads: 0,
        lbs: 0,
      }
    }
    cycleMap[cid].loads++
    cycleMap[cid].lbs += Number(log.weight_lbs)
  }
  const cycleSummary = Object.values(cycleMap).sort((a, b) => b.loads - a.loads)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Wash Info</h2>

      {/* Washer Utilization (today only) — always visible at top */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider">Washer Utilization (Today)</h3>
        <div className="grid grid-cols-6 gap-1">
          {washerUtil.map(w => (
            <div key={w.id} className={`rounded-md py-1 border text-center min-w-0 overflow-hidden ${utilizationColor(w.pct)}`}>
              <div className="flex justify-center px-2">
                <WashingMachine className={utilizationIconColor(w.pct)} style={{ width: '80%', maxWidth: 80, height: 'auto' }} />
              </div>
              <p className="text-sm font-bold leading-tight mt-0.5 truncate">{w.name}</p>
              <p className="text-xs font-medium leading-tight">{w.loads}L &middot; {w.lbs}lb</p>
              <p className="text-xs font-medium leading-tight">{w.pct}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Customer</label>
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Washer</label>
            <select
              value={filterWasher}
              onChange={(e) => setFilterWasher(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Washers</option>
              {washers.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 text-center">
            <p className="text-3xl font-bold text-[#1B2541]">{totalLoads}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase">Loads</p>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 text-center">
            <p className="text-3xl font-bold text-[#1B2541]">{totalLbs}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase">Total lbs</p>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 text-center">
            <p className="text-3xl font-bold text-[#1B2541]">{avgLbs}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase">Avg lbs/load</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading wash data...</div>
      ) : (
        <>
          {/* By Customer */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider">By Customer</h3>
            {customerSummary.length === 0 ? (
              <p className="text-gray-400 text-sm">No wash data for selected range.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {customerSummary.map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 flex flex-col items-center">
                    <CustomerLogo url={c.logo_url} name={c.name} size={175} />
                    <span className="text-lg font-bold text-[#1B2541] mt-1">{c.loads} load{c.loads !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-medium text-slate-500">{c.lbs} lbs</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By Cycle */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider">By Cycle</h3>
            {cycleSummary.length === 0 ? (
              <p className="text-gray-400 text-sm">No wash data for selected range.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {cycleSummary.map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 text-center">
                    <p className="text-lg font-bold text-[#1B2541]">{c.name}</p>
                    <p className="text-sm font-medium text-slate-500">{c.loads} load{c.loads !== 1 ? 's' : ''} &middot; {c.lbs} lbs</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
