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
  const [washedTodayLbs, setWashedTodayLbs] = useState(0)

  useEffect(() => {
    async function fetchData() {
      const [binsRes, trucksRes, washRes] = await Promise.all([
        supabase
          .from('bins')
          .select('id, current_status, customer_id, size, customers(id, name, logo_url)')
          .is('retired_at', null),
        supabase
          .from('trucks')
          .select('id, name')
          .order('name'),
        supabase
          .from('wash_logs')
          .select('weight_lbs')
          .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ])

      if (binsRes.error) {
        setError(binsRes.error.message)
        setLoading(false)
        return
      }

      const binsData = binsRes.data || []
      setBins(binsData)
      setTrucks(trucksRes.data || [])
      if (washRes.data) {
        setWashedTodayLbs(washRes.data.reduce((s, r) => s + Number(r.weight_lbs), 0))
      }

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

  // Plant Overview
  const receivedBins = groupByCustomer(bins, ['received_at_plant'])
  const receivedTotal = receivedBins.reduce((s, c) => s + c.count, 0)
  const inProcessBins = groupByCustomer(bins, ['in_process'])
  const inProcessTotal = inProcessBins.reduce((s, c) => s + c.count, 0)

  // By Location (At Plant + per-truck)
  const atPlantBins = groupByCustomer(bins, ['clean_staged', 'received_at_plant', 'in_process'])
  const atPlantTotal = atPlantBins.reduce((s, c) => s + c.count, 0)
  const onTruckStatusBins = bins.filter(b => b.current_status === 'loaded' || b.current_status === 'picked_up_soiled')
  const lost = bins.filter((b) => b.current_status === 'lost').length

  // Plant Status — always show all four
  const PLANT_STATUSES = ['received_at_plant', 'in_process', 'clean_staged', 'delivered']
  const plantStatus = PLANT_STATUSES.map((status) => {
    const customers = groupByCustomer(bins, [status])
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { status, total, customers }
  })

  // On Truck — 4 fixed windows by size + status
  const TRUCK_WINDOWS = [
    { label: "16' Clean",  status: 'loaded',           size: '16' },
    { label: "16' Soiled", status: 'picked_up_soiled', size: '16' },
    { label: "26' Clean",  status: 'loaded',           size: '26' },
    { label: "26' Soiled", status: 'picked_up_soiled', size: '26' },
  ]
  const truckWindows = TRUCK_WINDOWS.map(({ label, status, size }) => {
    const filtered = bins.filter(b => b.current_status === status && b.size === size)
    const customers = groupBinsByCustomer(filtered)
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { label, total, customers }
  })

  return (
    <div className="space-y-2">
      {/* Plant Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Plant Overview</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{receivedTotal} <span className="text-slate-500">Soiled Bins</span></p>
            <CustomerGrid customers={receivedBins} />
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{inProcessTotal} <span className="text-slate-500">In Process</span></p>
            <CustomerGrid customers={inProcessBins} />
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <p className="text-4xl font-bold text-[#1B2541]">{washedTodayLbs} <span className="text-slate-500">lbs Washed Today</span></p>
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
          {trucks.map(truck => {
            const truckBins = onTruckStatusBins.filter(b => binTruckMap[b.id] === truck.id)
            const customers = groupBinsByCustomer(truckBins)
            const total = customers.reduce((s, c) => s + c.count, 0)
            if (total === 0) return null
            return (
              <div key={truck.id} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
                <p className="text-4xl font-bold text-[#1B2541]">{total} <span className="text-slate-500">{truck.name}</span></p>
                <CustomerGrid customers={customers} />
              </div>
            )
          })}
        </div>
        {lost > 0 && (
          <div className="mt-2 text-center text-sm font-medium text-rose-600">
            {lost} bin{lost !== 1 ? 's' : ''} marked lost
          </div>
        )}
      </div>

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
