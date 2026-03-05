import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dashLabel, groupByCustomer, groupBinsByCustomer } from '../lib/binUtils'
import CustomerGrid from '../components/CustomerGrid'

export default function DashboardPage() {
  const [bins, setBins] = useState([])
  const [trucks, setTrucks] = useState([])
  const [binTruckMap, setBinTruckMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  useEffect(() => {
    async function fetchData() {
      const [binsRes, trucksRes] = await Promise.all([
        supabase
          .from('bins')
          .select('id, current_status, customer_id, size, customers(id, name, logo_url)')
          .is('retired_at', null),
        supabase
          .from('trucks')
          .select('id, name')
          .order('name'),
      ])

      if (binsRes.error) {
        setError(binsRes.error.message)
        setLoading(false)
        return
      }

      const binsData = binsRes.data || []
      setBins(binsData)
      setTrucks(trucksRes.data || [])

      // Build bin→truck map from latest loaded scan events
      const onTruckIds = binsData
        .filter(b => b.current_status === 'loaded' || b.current_status === 'picked_up_soiled')
        .map(b => b.id)

      if (onTruckIds.length > 0) {
        const { data: scanEvents } = await supabase
          .from('scan_events')
          .select('bin_id, truck_id')
          .in('bin_id', onTruckIds)
          .eq('status', 'loaded')
          .not('truck_id', 'is', null)
          .order('scanned_at', { ascending: false })

        if (scanEvents) {
          const map = {}
          for (const ev of scanEvents) {
            if (!map[ev.bin_id]) map[ev.bin_id] = ev.truck_id
          }
          setBinTruckMap(map)
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>
  }

  if (error) {
    return <div className="p-4 bg-rose-50 text-rose-700 rounded-lg">{error}</div>
  }

  const onTruckStatusBins = bins.filter(b => b.current_status === 'loaded' || b.current_status === 'picked_up_soiled')
  console.log('[Dashboard] onTruckStatusBins:', onTruckStatusBins.map(b => ({ id: b.id, status: b.current_status, size: b.size, sizeType: typeof b.size })))

  // Plant Status — always show all four
  const PLANT_STATUSES = ['received_at_plant', 'in_process', 'clean_staged', 'delivered']
  const plantStatus = PLANT_STATUSES.map((status) => {
    const customers = groupByCustomer(bins, [status])
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { status, total, customers }
  })

  // On Truck — 4 fixed windows by bin.size + status
  const TRUCK_WINDOWS = [
    { label: "16' Clean",  status: 'loaded',           size: '16' },
    { label: "16' Soiled", status: 'picked_up_soiled', size: '16' },
    { label: "26' Clean",  status: 'loaded',           size: '26' },
    { label: "26' Soiled", status: 'picked_up_soiled', size: '26' },
  ]
  const truckWindows = TRUCK_WINDOWS.map(({ label, status, size }) => {
    const filtered = onTruckStatusBins.filter(b =>
      b.current_status === status && b.size === size
    )
    console.log(`[Dashboard] ${label}: filtering status=${status} size=${size} → matched ${filtered.length}`, filtered.map(b => ({ id: b.id, size: b.size, status: b.current_status })))
    const customers = groupBinsByCustomer(filtered)
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { label, total, customers }
  })

  return (
    <div className="space-y-2">
      {/* Plant Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Plant Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {plantStatus.map(({ status, total, customers }) => (
            <div key={status} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <p className="text-4xl font-bold text-[#1B2541]">{total} <span className="text-slate-500">{dashLabel(status)}</span></p>
              <CustomerGrid customers={customers} />
            </div>
          ))}
        </div>
      </div>

      {/* On Truck */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">On Truck</h3>
        <div className="grid grid-cols-2 gap-3">
          {truckWindows.map(({ label, total, customers }) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <p className="text-4xl font-bold text-[#1B2541]">{total} <span className="text-slate-500">{label}</span></p>
              <CustomerGrid customers={customers} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
