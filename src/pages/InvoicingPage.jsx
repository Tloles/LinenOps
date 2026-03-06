import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import CustomerLogo from '../components/CustomerLogo'

// Map sku_key to display name and category
const SPECIALTY_KEYS = {
  comforter: 'Comforter',
  shower_curtain: 'Shower Curtain',
  pillow: 'Pillow',
  blanket: 'Blanket',
  robe: 'Robe',
  bed_skirt: 'Bed Skirt',
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
    }
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
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // Running total
  const runningTotal = useMemo(() => {
    return logs.reduce((sum, l) => sum + (l.invoice_amount || 0), 0)
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Invoicing</h2>

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
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${isInvoiced ? 'bg-green-50/50 text-gray-400' : ''}`}
                  >
                    <td className="py-2 px-3 border-b border-slate-100 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-2 px-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <CustomerLogo url={log.customers?.logo_url} name={log.customers?.name} size={32} />
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
                <td colSpan={4} className="py-3 px-3 text-right uppercase text-xs text-gray-600">
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
    </div>
  )
}
