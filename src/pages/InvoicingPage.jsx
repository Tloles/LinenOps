import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import CustomerLogo from '../components/CustomerLogo'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// Map sku_key to display name and category
const SPECIALTY_KEYS = {
  comforter: 'Comforter',
  shower_curtain: 'Shower Curtain',
  pillow: 'Pillow',
  blanket: 'Blanket',
  robe: 'Robe',
  bed_skirt: 'Bed Skirt',
}

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-100 px-4 py-3">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-gray-900">
        ${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  )
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`
}

function fmtAxisDollar(val) {
  if (val >= 1000) return '$' + (val / 1000).toFixed(val >= 10000 ? 0 : 1) + 'k'
  return '$' + val
}

export default function InvoicingPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [logs, setLogs] = useState([])
  const [logItems, setLogItems] = useState({}) // logId -> items[]
  const [loading, setLoading] = useState(false)

  // Filters
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Summary cards
  const [summaryData, setSummaryData] = useState({
    producedToday: 0,
    producedThisWeek: 0,
    invoicedThisWeek: 0,
    totalUnbilled: 0,
  })

  // Checkboxes & bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Customer insights slide-out
  const [insightCustomerId, setInsightCustomerId] = useState(null)
  const [insightData, setInsightData] = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)

  // Trends
  const [trendPeriod, setTrendPeriod] = useState('weekly')

  // Derived: uninvoiced logs
  const uninvoicedLogs = useMemo(() => logs.filter(l => !l.invoiced), [logs])

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [selectedCustomer, dateFrom, dateTo])

  // Fetch customers for dropdown
  useEffect(() => {
    async function fetchCustomers() {
      const { data } = await supabase
        .from('customers')
        .select('id, name')
        .order('name')
      if (data) setCustomers(data)
    }
    fetchCustomers()
  }, [])

  // Fetch summary totals
  const fetchSummaryTotals = useCallback(async () => {
    // Production day cutoff: 5 AM Eastern (America/New_York)
    // If before 5 AM ET, the "production day" started at 5 AM yesterday
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const nowUTC = new Date()

    // ET offset in ms (difference between UTC and ET right now)
    const etOffsetMs = nowUTC.getTime() - nowET.getTime()

    // Build 5 AM ET today as a Date in local/UTC terms
    const fiveAMToday = new Date(nowET)
    fiveAMToday.setHours(5, 0, 0, 0)
    // Convert back to UTC
    const fiveAMTodayUTC = new Date(fiveAMToday.getTime() + etOffsetMs)

    // Production day start: 5 AM ET today if we're past it, otherwise 5 AM ET yesterday
    const prodDayStart = nowUTC >= fiveAMTodayUTC
      ? fiveAMTodayUTC
      : new Date(fiveAMTodayUTC.getTime() - 24 * 60 * 60 * 1000)

    // Production week: last 7 production days
    const prodWeekStart = new Date(prodDayStart.getTime() - 6 * 24 * 60 * 60 * 1000)

    const prodDayISO = prodDayStart.toISOString()
    const prodWeekISO = prodWeekStart.toISOString()

    const [producedToday, producedThisWeek, invoicedThisWeek, unbilled] = await Promise.all([
      supabase.from('production_logs').select('invoice_amount')
        .gte('created_at', prodDayISO),
      supabase.from('production_logs').select('invoice_amount')
        .gte('created_at', prodWeekISO),
      supabase.from('production_logs').select('invoice_amount').eq('invoiced', true)
        .gte('created_at', prodWeekISO),
      supabase.from('production_logs').select('invoice_amount').eq('invoiced', false),
    ])

    const sum = (arr) => (arr || []).reduce((s, r) => s + (r.invoice_amount || 0), 0)
    setSummaryData({
      producedToday: sum(producedToday.data),
      producedThisWeek: sum(producedThisWeek.data),
      invoicedThisWeek: sum(invoicedThisWeek.data),
      totalUnbilled: sum(unbilled.data),
    })
  }, [])

  // Fetch production logs based on filters
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('production_logs')
      .select('id, customer_id, linen_weight, linen_charge, specialty_charge, invoice_amount, invoiced, created_at, customers(id, name, logo_url)')
      .order('created_at', { ascending: false })

    if (selectedCustomer) {
      query = query.eq('customer_id', selectedCustomer)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom + 'T00:00:00')
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo + 'T23:59:59')
    }

    const { data } = await query
    if (data) {
      setLogs(data)
      // Fetch specialty items for these logs
      if (data.length > 0) {
        const logIds = data.map(l => l.id)
        const { data: items } = await supabase
          .from('production_log_items')
          .select('production_log_id, sku_key, quantity')
          .in('production_log_id', logIds)

        if (items) {
          const grouped = {}
          for (const item of items) {
            // Only include specialty items
            if (SPECIALTY_KEYS[item.sku_key] && item.quantity > 0) {
              if (!grouped[item.production_log_id]) grouped[item.production_log_id] = []
              grouped[item.production_log_id].push({
                name: SPECIALTY_KEYS[item.sku_key],
                quantity: item.quantity,
              })
            }
          }
          setLogItems(grouped)
        } else {
          setLogItems({})
        }
      } else {
        setLogItems({})
      }
    }
    setLoading(false)
  }, [selectedCustomer, dateFrom, dateTo])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Fetch summary on mount and when logs change
  useEffect(() => {
    fetchSummaryTotals()
  }, [fetchSummaryTotals])

  // Toggle invoiced status
  async function toggleInvoiced(logId, current) {
    // Optimistic update
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, invoiced: !current } : l))
    const { error } = await supabase
      .from('production_logs')
      .update({ invoiced: !current })
      .eq('id', logId)
    if (error) {
      // Revert on error
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, invoiced: current } : l))
    } else {
      fetchSummaryTotals()
    }
  }

  // Bulk mark as invoiced
  async function bulkMarkInvoiced() {
    if (selectedIds.size === 0) return
    setBulkUpdating(true)
    const ids = [...selectedIds]
    // Optimistic update
    setLogs(prev => prev.map(l => ids.includes(l.id) ? { ...l, invoiced: true } : l))
    setSelectedIds(new Set())

    const { error } = await supabase
      .from('production_logs')
      .update({ invoiced: true })
      .in('id', ids)

    if (error) {
      // Revert on error
      setLogs(prev => prev.map(l => ids.includes(l.id) ? { ...l, invoiced: false } : l))
    }
    fetchSummaryTotals()
    setBulkUpdating(false)
  }

  // Delete a production log
  async function handleDelete(logId) {
    if (!window.confirm('Are you sure you want to delete this production log?')) return
    try {
      await supabase
        .from('production_log_items')
        .delete()
        .eq('production_log_id', logId)
      const { error } = await supabase
        .from('production_logs')
        .delete()
        .eq('id', logId)
      if (error) throw error
      setLogs(prev => prev.filter(l => l.id !== logId))
      fetchSummaryTotals()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // Select all / deselect all uninvoiced
  function toggleSelectAll() {
    if (selectedIds.size === uninvoicedLogs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(uninvoicedLogs.map(l => l.id)))
    }
  }

  function toggleSelectOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Customer insights
  async function fetchCustomerInsights(customerId) {
    setInsightCustomerId(customerId)
    setInsightLoading(true)
    setInsightData(null)

    const [logsRes, customerRes] = await Promise.all([
      supabase.from('production_logs')
        .select('id, linen_weight, invoice_amount, invoiced, created_at')
        .eq('customer_id', customerId),
      supabase.from('customers')
        .select('id, name, logo_url')
        .eq('id', customerId)
        .single(),
    ])

    const allLogs = logsRes.data || []
    const customer = customerRes.data

    const totalDeliveries = allLogs.length
    const totalLbs = allLogs.reduce((s, l) => s + (l.linen_weight || 0), 0)
    const avgLbs = totalDeliveries > 0 ? Math.round(totalLbs / totalDeliveries) : 0
    const totalRevenue = allLogs.reduce((s, l) => s + (l.invoice_amount || 0), 0)
    const totalUnbilled = allLogs.filter(l => !l.invoiced).reduce((s, l) => s + (l.invoice_amount || 0), 0)

    const sortedByDate = [...allLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const lastDeliveryDate = sortedByDate[0]?.created_at || null

    // Last 6 months monthly revenue
    const now = new Date()
    const monthlyRevenue = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' })
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      const rev = allLogs
        .filter(l => {
          const ld = new Date(l.created_at)
          return ld >= monthStart && ld <= monthEnd
        })
        .reduce((s, l) => s + (l.invoice_amount || 0), 0)
      monthlyRevenue.push({ month: label, revenue: rev })
    }

    setInsightData({
      customer,
      totalDeliveries,
      avgLbs,
      totalRevenue,
      totalUnbilled,
      lastDeliveryDate,
      monthlyRevenue,
    })
    setInsightLoading(false)
  }

  // Running total
  const runningTotal = useMemo(() => {
    return logs.reduce((sum, l) => sum + (l.invoice_amount || 0), 0)
  }, [logs])

  // Trend charts data
  const revenueOverTime = useMemo(() => {
    if (logs.length === 0) return []
    const groups = {}
    for (const log of logs) {
      const d = new Date(log.created_at)
      let key
      if (trendPeriod === 'weekly') {
        // ISO week start (Monday)
        const day = d.getDay()
        const mon = new Date(d)
        mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
        key = mon.toISOString().slice(0, 10)
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      }
      groups[key] = (groups[key] || 0) + (log.invoice_amount || 0)
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, revenue]) => ({
        period: trendPeriod === 'weekly' ? fmtShortDate(period) : new Date(period + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
        revenue: Math.round(revenue * 100) / 100,
      }))
  }, [logs, trendPeriod])

  const revenueByCustomer = useMemo(() => {
    if (logs.length === 0) return []
    const groups = {}
    for (const log of logs) {
      const name = log.customers?.name || 'Unknown'
      groups[name] = (groups[name] || 0) + (log.invoice_amount || 0)
    }
    return Object.entries(groups)
      .sort(([, a], [, b]) => b - a)
      .map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }))
  }, [logs])

  const lbsOverTime = useMemo(() => {
    if (logs.length === 0) return []
    const groups = {}
    for (const log of logs) {
      const d = new Date(log.created_at).toISOString().slice(0, 10)
      groups[d] = (groups[d] || 0) + (log.linen_weight || 0)
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, lbs]) => ({ date: fmtShortDate(date), lbs }))
  }, [logs])

  function fmt(val) {
    if (val == null) return '$0.00'
    return '$' + Number(val).toFixed(2)
  }

  function formatDate(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleDateString()
  }

  const summaryCards = [
    { label: 'Produced Today', value: summaryData.producedToday, color: 'border-green-400', bg: 'bg-green-50', text: 'text-green-700' },
    { label: 'Produced This Week', value: summaryData.producedThisWeek, color: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-700' },
    { label: 'Invoiced This Week', value: summaryData.invoicedThisWeek, color: 'border-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    { label: 'Total Unbilled', value: summaryData.totalUnbilled, color: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Invoicing</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className={`bg-white rounded-lg border border-gray-200 border-l-4 ${card.color} p-4`}>
            <div className="text-xs font-medium text-gray-500 uppercase">{card.label}</div>
            <div className={`text-xl font-bold ${card.text} mt-1`}>{fmt(card.value)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">
            {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={bulkMarkInvoiced}
            disabled={bulkUpdating}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {bulkUpdating ? 'Updating...' : 'Mark Selected as Invoiced'}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No production logs found.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 text-left text-xs font-bold text-[#1B2541] uppercase">
                <th className="py-3 px-3 border-b border-slate-200 w-10">
                  <input
                    type="checkbox"
                    checked={uninvoicedLogs.length > 0 && selectedIds.size === uninvoicedLogs.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="py-3 px-3 border-b border-slate-200">Date</th>
                <th className="py-3 px-3 border-b border-slate-200">Customer</th>
                <th className="py-3 px-3 border-b border-slate-200 text-right">Linen LBS</th>
                <th className="py-3 px-3 border-b border-slate-200">Specialty Items</th>
                <th className="py-3 px-3 border-b border-slate-200 text-right">Linen Charge</th>
                <th className="py-3 px-3 border-b border-slate-200 text-right">Specialty Charge</th>
                <th className="py-3 px-3 border-b border-slate-200 text-right">Total</th>
                <th className="py-3 px-3 border-b border-slate-200 text-center">Invoiced</th>
                <th className="py-3 px-3 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => {
                const specialtyItems = logItems[log.id] || []
                const isInvoiced = log.invoiced
                return (
                  <tr
                    key={log.id}
                    className={isInvoiced ? 'bg-green-50 text-gray-400' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}
                  >
                    <td className="py-2 px-3 border-b border-slate-100">
                      {!isInvoiced ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(log.id)}
                          onChange={() => toggleSelectOne(log.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      ) : null}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => fetchCustomerInsights(log.customer_id)}
                        >
                          <CustomerLogo url={log.customers?.logo_url} name={log.customers?.name} size={32} />
                        </div>
                        <span className="font-medium">{log.customers?.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-right font-medium">
                      {log.linen_weight || 0}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-xs">
                      {specialtyItems.length > 0
                        ? specialtyItems.map((item, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              {item.quantity} × {item.name}
                            </span>
                          ))
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-right">
                      {fmt(log.linen_charge)}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-right">
                      {fmt(log.specialty_charge)}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-right font-bold">
                      {fmt(log.invoice_amount)}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-center">
                      <button
                        onClick={() => toggleInvoiced(log.id, log.invoiced)}
                        className={`w-8 h-8 rounded-full border-2 inline-flex items-center justify-center transition-colors ${
                          isInvoiced
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 text-transparent hover:border-green-400'
                        }`}
                        title={isInvoiced ? 'Mark as not invoiced' : 'Mark as invoiced'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100 text-center">
                      {!isInvoiced && (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => navigate(`/production?edit=${log.id}`)}
                            className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Footer with running total */}
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td colSpan={5} className="py-3 px-3 text-right uppercase text-xs text-gray-600">
                  Total
                </td>
                <td className="py-3 px-3 text-right">
                  {fmt(logs.reduce((s, l) => s + (l.linen_charge || 0), 0))}
                </td>
                <td className="py-3 px-3 text-right">
                  {fmt(logs.reduce((s, l) => s + (l.specialty_charge || 0), 0))}
                </td>
                <td className="py-3 px-3 text-right">
                  {fmt(runningTotal)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Trends Section */}
      {logs.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-md font-semibold text-gray-900">Trends</h3>

          {/* Revenue Over Time - full width */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-sm font-semibold text-gray-800">Revenue Over Time</h4>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setTrendPeriod('weekly')}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${trendPeriod === 'weekly' ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setTrendPeriod('monthly')}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${trendPeriod === 'monthly' ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Monthly
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueOverTime} barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradNavy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#1e3a5f" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={fmtAxisDollar} />
                <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(30,58,95,0.04)' }} />
                <Bar dataKey="revenue" fill="url(#gradNavy)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Side by side: Revenue by Customer + Lbs Over Time */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h4 className="text-sm font-semibold text-gray-800 mb-5">Revenue by Customer</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueByCustomer} barCategoryGap="25%">
                  <defs>
                    <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#1e3a5f" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} angle={revenueByCustomer.length > 5 ? -30 : 0} textAnchor={revenueByCustomer.length > 5 ? 'end' : 'middle'} height={revenueByCustomer.length > 5 ? 60 : 30} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={fmtAxisDollar} />
                  <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(30,58,95,0.04)' }} />
                  <Bar dataKey="revenue" fill="url(#gradBlue)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h4 className="text-sm font-semibold text-gray-800 mb-5">Lbs Over Time</h4>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={lbsOverTime}>
                  <defs>
                    <linearGradient id="gradTeal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => v + ' lbs'} />
                  <Tooltip content={<LbsTooltip />} cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="lbs" stroke="#10b981" strokeWidth={2.5} fill="url(#gradTeal)" dot={{ r: 3, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} animationDuration={800} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Customer Insights Slide-Out Panel */}
      {insightCustomerId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setInsightCustomerId(null)}
          />
          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Customer Insights</h3>
                <button
                  onClick={() => setInsightCustomerId(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {insightLoading ? (
                <div className="text-center py-12 text-gray-500">Loading insights...</div>
              ) : insightData ? (
                <div className="space-y-6">
                  {/* Customer info */}
                  <div className="flex items-center gap-4">
                    <CustomerLogo url={insightData.customer?.logo_url} name={insightData.customer?.name} size={80} />
                    <h4 className="text-xl font-bold text-gray-900">{insightData.customer?.name}</h4>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 uppercase">Total Deliveries</div>
                      <div className="text-lg font-bold text-gray-900 mt-1">{insightData.totalDeliveries}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 uppercase">Avg LBS</div>
                      <div className="text-lg font-bold text-gray-900 mt-1">{insightData.avgLbs}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 uppercase">Total Revenue</div>
                      <div className="text-lg font-bold text-green-700 mt-1">{fmt(insightData.totalRevenue)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 uppercase">Unbilled</div>
                      <div className="text-lg font-bold text-amber-700 mt-1">{fmt(insightData.totalUnbilled)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                      <div className="text-xs font-medium text-gray-500 uppercase">Last Delivery</div>
                      <div className="text-lg font-bold text-gray-900 mt-1">
                        {insightData.lastDeliveryDate ? formatDate(insightData.lastDeliveryDate) : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Monthly revenue chart */}
                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-3">Monthly Revenue (Last 6 Months)</h5>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={insightData.monthlyRevenue} barCategoryGap="20%">
                        <defs>
                          <linearGradient id="gradInsight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#1e3a5f" stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={fmtAxisDollar} />
                        <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(30,58,95,0.04)' }} />
                        <Bar dataKey="revenue" fill="url(#gradInsight)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
