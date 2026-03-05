import { useEffect, useState } from 'react'
import { WashingMachine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { WASHER_ICON_SIZE } from '../lib/binUtils'
import CustomerLogo from '../components/CustomerLogo'

export default function WashPage() {
  const { user } = useAuth()

  const [washers, setWashers] = useState([])
  const [customers, setCustomers] = useState([])
  const [cycles, setCycles] = useState([])

  const [selectedWasher, setSelectedWasher] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedCycle, setSelectedCycle] = useState(null)
  const [weight, setWeight] = useState('')

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const [todayLogs, setTodayLogs] = useState([])

  useEffect(() => {
    fetchReferenceData()
    fetchTodayLogs()
  }, [])

  async function fetchReferenceData() {
    const [w, cu, cy] = await Promise.all([
      supabase.from('washers').select('*').order('name'),
      supabase.from('customers').select('id, name, logo_url').order('name'),
      supabase.from('wash_cycles').select('*').order('name'),
    ])
    if (w.data) setWashers(w.data)
    if (cu.data) setCustomers(cu.data)
    if (cy.data) setCycles(cy.data)
  }

  async function fetchTodayLogs() {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

    console.log('[WashPage] fetchTodayLogs range:', todayStart, '→', todayEnd)

    const { data, error } = await supabase
      .from('wash_logs')
      .select('id, weight_lbs, washer_id, customer_id, customers(id, name, logo_url), washers(id, name)')
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd)
      .order('created_at', { ascending: false })

    console.log('[WashPage] wash_logs returned:', data?.length, 'rows', error ? `error: ${error.message}` : '')
    if (data) setTodayLogs(data)
  }

  const canSubmit = selectedWasher && selectedCustomer && selectedCycle && weight && !saving

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('wash_logs').insert({
      washer_id: selectedWasher,
      customer_id: selectedCustomer,
      wash_cycle_id: selectedCycle,
      weight_lbs: parseFloat(weight),
      washed_by: user.id,
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setSuccess(true)
    setSelectedCustomer(null)
    setWeight('')
    setSaving(false)
    fetchTodayLogs()
    setTimeout(() => setSuccess(false), 2000)
  }

  // Today's summary computations
  const totalLoads = todayLogs.length
  const totalLbs = todayLogs.reduce((s, l) => s + Number(l.weight_lbs), 0)

  const byCustomer = {}
  for (const log of todayLogs) {
    const cid = log.customer_id
    if (!byCustomer[cid]) {
      byCustomer[cid] = {
        id: cid,
        name: log.customers?.name || 'Unknown',
        logo_url: log.customers?.logo_url,
        loads: 0,
        lbs: 0,
      }
    }
    byCustomer[cid].loads++
    byCustomer[cid].lbs += Number(log.weight_lbs)
  }
  const customerSummary = Object.values(byCustomer).sort((a, b) => a.name.localeCompare(b.name))

  const byWasher = {}
  for (const log of todayLogs) {
    const wid = log.washer_id
    if (!byWasher[wid]) {
      byWasher[wid] = {
        id: wid,
        name: log.washers?.name || 'Unknown',
        loads: 0,
        lbs: 0,
      }
    }
    byWasher[wid].loads++
    byWasher[wid].lbs += Number(log.weight_lbs)
  }
  const washerSummary = Object.values(byWasher).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-4">
      {/* Log a Wash Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        {/* Washer Row */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Washer</label>
          <div className="flex gap-2 overflow-x-auto">
            {washers.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWasher(w.id)}
                className={`min-h-[48px] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex flex-col items-center gap-1 ${
                  selectedWasher === w.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <WashingMachine size={WASHER_ICON_SIZE} />
                {w.name} ({w.capacity} lbs)
              </button>
            ))}
          </div>
        </div>

        {/* Customer Grid */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Customer</label>
          <div className="grid grid-cols-3 gap-3">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCustomer(c.id)}
                className={`flex flex-col items-center p-3 rounded-lg border-2 ${
                  selectedCustomer === c.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200'
                }`}
              >
                <CustomerLogo url={c.logo_url} name={c.name} size={175} />
              </button>
            ))}
          </div>
        </div>

        {/* Wash Cycle Grid */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Wash Cycle</label>
          <div className="flex flex-wrap gap-2">
            {cycles.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCycle(c.id)}
                className={`min-h-[48px] px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedCycle === c.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Weight Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Weight (lbs)</label>
          <input
            type="number"
            inputMode="numeric"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Error / Success */}
        {error && <div className="text-sm text-rose-600 bg-rose-50 p-2 rounded">{error}</div>}
        {success && <div className="text-sm text-green-700 bg-green-50 p-2 rounded">Wash logged!</div>}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full min-h-[56px] rounded-lg text-lg font-bold text-white ${
            canSubmit ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {saving ? 'Logging...' : 'Log Wash'}
        </button>
      </div>

      {/* Today's Wash Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider">Today's Wash Summary</h3>

        {/* Totals Bar */}
        <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
          <p className="text-2xl font-bold text-[#1B2541]">
            Today: {totalLoads} load{totalLoads !== 1 ? 's' : ''} &middot; {totalLbs} lbs
          </p>
        </div>

        {/* By Customer */}
        {customerSummary.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">By Customer</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {customerSummary.map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 flex flex-col items-center">
                  <CustomerLogo url={c.logo_url} name={c.name} size={80} />
                  <span className="text-lg font-bold text-[#1B2541]">{c.loads} loads &middot; {c.lbs} lbs</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Washer */}
        {washerSummary.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">By Washer</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {washerSummary.map((w) => (
                <div key={w.id} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 text-center">
                  <span className="text-sm font-semibold text-gray-700">{w.name}</span>
                  <p className="text-lg font-bold text-[#1B2541]">{w.loads} loads &middot; {w.lbs} lbs</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
