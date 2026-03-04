import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SCAN_STATUSES, statusLabel } from '../lib/constants'

const DASHBOARD_LABELS = {
  received_at_plant: 'Soiled Bins',
}

function dashLabel(status) {
  return DASHBOARD_LABELS[status] || statusLabel(status)
}
import CustomerLogo from '../components/CustomerLogo'

function groupByCustomer(bins, statuses) {
  const map = {}
  for (const bin of bins) {
    if (!statuses.includes(bin.current_status)) continue
    const cust = bin.customers
    if (!cust) continue
    if (!map[cust.id]) map[cust.id] = { ...cust, count: 0 }
    map[cust.id].count++
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

function CustomerGrid({ customers }) {
  if (customers.length === 0) {
    return <div className="text-sm text-gray-400 mt-1">None</div>
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
      {customers.map((cust) => (
        <div key={cust.id} className="flex flex-col items-center">
          <CustomerLogo url={cust.logo_url} name={cust.name} size={200} />
          <div className="text-2xl font-bold text-[#1B2541] -mt-1">{cust.count}</div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [bins, setBins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchBins() {
      const { data, error } = await supabase
        .from('bins')
        .select('id, current_status, customer_id, customers(id, name, logo_url)')
        .is('retired_at', null)

      if (error) {
        setError(error.message)
      } else {
        setBins(data)
      }
      setLoading(false)
    }
    fetchBins()
  }, [])

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>
  }

  if (error) {
    return <div className="p-4 bg-rose-50 text-rose-700 rounded-lg">{error}</div>
  }

  // Plant Overview
  const receivedBins = groupByCustomer(bins, ['received_at_plant'])
  const receivedTotal = receivedBins.reduce((s, c) => s + c.count, 0)
  const inProcessBins = groupByCustomer(bins, ['in_process'])
  const inProcessTotal = inProcessBins.reduce((s, c) => s + c.count, 0)

  // By Location (At Plant + On Truck only)
  const atPlantBins = groupByCustomer(bins, ['clean_staged', 'received_at_plant', 'in_process'])
  const atPlantTotal = atPlantBins.reduce((s, c) => s + c.count, 0)
  const onTruckBins = groupByCustomer(bins, ['loaded', 'picked_up_soiled'])
  const onTruckTotal = onTruckBins.reduce((s, c) => s + c.count, 0)
  const lost = bins.filter((b) => b.current_status === 'lost').length

  // By Status — each active status with customer breakdown
  const byStatus = SCAN_STATUSES.map((status) => {
    const customers = groupByCustomer(bins, [status])
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { status, total, customers }
  }).filter((s) => s.total > 0)

  return (
    <div className="space-y-2">
      {/* Plant Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Plant Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{receivedTotal} <span className="text-slate-500">Soiled Bins</span></p>
            <CustomerGrid customers={receivedBins} />
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{inProcessTotal} <span className="text-slate-500">In Process</span></p>
            <CustomerGrid customers={inProcessBins} />
          </div>
        </div>
      </div>

      {/* By Location */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">By Location</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{atPlantTotal} <span className="text-slate-500">At Plant</span></p>
            <CustomerGrid customers={atPlantBins} />
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{onTruckTotal} <span className="text-slate-500">On Truck</span></p>
            <CustomerGrid customers={onTruckBins} />
          </div>
        </div>
        {lost > 0 && (
          <div className="mt-2 text-center text-sm font-medium text-rose-600">
            {lost} bin{lost !== 1 ? 's' : ''} marked lost
          </div>
        )}
      </div>

      {/* By Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">By Status</h3>
        {byStatus.length === 0 ? (
          <p className="text-gray-400 text-sm">No active bins.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {byStatus.map(({ status, total, customers }) => (
              <div key={status} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
                <p className="text-4xl font-bold text-[#1B2541]">{total} <span className="text-slate-500 capitalize">{dashLabel(status)}</span></p>
                <CustomerGrid customers={customers} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
