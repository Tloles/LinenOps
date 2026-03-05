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

  const [recentLogs, setRecentLogs] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({})

  useEffect(() => {
    fetchReferenceData()
    fetchRecentLogs()
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

  async function fetchRecentLogs() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('wash_logs')
      .select('id, weight_lbs, washer_id, customer_id, wash_cycle_id, washed_at, customers(id, name, logo_url), washers(id, name), wash_cycles(id, name)')
      .gte('washed_at', since)
      .order('washed_at', { ascending: false })

    if (data) setRecentLogs(data)
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
    fetchRecentLogs()
    setTimeout(() => setSuccess(false), 2000)
  }

  function startEdit(log) {
    setEditingId(log.id)
    setEditValues({
      washer_id: log.washer_id,
      customer_id: log.customer_id,
      wash_cycle_id: log.wash_cycle_id,
      weight_lbs: String(log.weight_lbs),
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValues({})
  }

  async function saveEdit(id) {
    const { error: updateError } = await supabase
      .from('wash_logs')
      .update({
        washer_id: editValues.washer_id,
        customer_id: editValues.customer_id,
        wash_cycle_id: editValues.wash_cycle_id,
        weight_lbs: parseFloat(editValues.weight_lbs),
      })
      .eq('id', id)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditingId(null)
    setEditValues({})
    fetchRecentLogs()
  }

  async function deleteLog(id) {
    const { error: deleteError } = await supabase
      .from('wash_logs')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }
    fetchRecentLogs()
  }

  function formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      {/* Log a Wash Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        {/* Washer Row */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Washer</label>
          <div className="grid grid-cols-6 gap-2">
            {washers.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWasher(w.id)}
                className={`min-h-[48px] py-2 rounded-lg text-sm font-medium flex flex-col items-center gap-1 min-w-0 ${
                  selectedWasher === w.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <WashingMachine className="w-full h-auto max-w-[80px]" />
                <span className="truncate w-full text-center">{w.name}</span>
                <span className="text-xs opacity-80">{w.capacity_lbs || w.capacity} lbs</span>
              </button>
            ))}
          </div>
        </div>

        {/* Customer Grid */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Customer</label>
          <div className="grid grid-cols-4 gap-3">
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

      {/* Recent Wash Log (last 24h) */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider">Recent Washes</h3>
        {recentLogs.length === 0 ? (
          <p className="text-gray-400 text-sm">No washes in the last 24 hours.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-lg border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-100 text-center text-base font-bold text-[#1B2541] uppercase">
                  <th className="py-2 px-1 border border-slate-200">Time</th>
                  <th className="py-2 px-1 border border-slate-200">W</th>
                  <th className="py-2 px-1 border border-slate-200">Customer</th>
                  <th className="py-2 px-1 border border-slate-200">Cycle</th>
                  <th className="py-2 px-1 border border-slate-200">lbs</th>
                  <th className="py-2 px-1 border border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log, idx) => (
                  <tr key={log.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {editingId === log.id ? (
                      <>
                        <td className="py-1 px-1 border border-slate-200 text-center text-gray-500">{formatTime(log.washed_at)}</td>
                        <td className="py-1 px-1 border border-slate-200 text-center">
                          <select
                            value={editValues.washer_id}
                            onChange={(e) => setEditValues({ ...editValues, washer_id: e.target.value })}
                            className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                          >
                            {washers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center">
                          <select
                            value={editValues.customer_id}
                            onChange={(e) => setEditValues({ ...editValues, customer_id: e.target.value })}
                            className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                          >
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center">
                          <select
                            value={editValues.wash_cycle_id}
                            onChange={(e) => setEditValues({ ...editValues, wash_cycle_id: e.target.value })}
                            className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                          >
                            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center">
                          <input
                            type="number"
                            value={editValues.weight_lbs}
                            onChange={(e) => setEditValues({ ...editValues, weight_lbs: e.target.value })}
                            className="border border-gray-300 rounded px-1 py-1 text-xs w-full text-center"
                          />
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center whitespace-nowrap">
                          <button onClick={() => saveEdit(log.id)} className="text-xs font-medium text-green-600 hover:text-green-800 mr-1">Save</button>
                          <button onClick={cancelEdit} className="text-xs font-medium text-gray-400 hover:text-gray-600">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1 px-1 border border-slate-200 text-center text-gray-500 whitespace-nowrap">{formatTime(log.washed_at)}</td>
                        <td className="py-1 px-1 border border-slate-200 text-center font-medium">{log.washers?.name?.replace(/\D/g, '') ? 'W' + log.washers.name.replace(/\D/g, '') : log.washers?.name}</td>
                        <td className="py-1 px-1 border border-slate-200 text-center">
                          <CustomerLogo url={log.customers?.logo_url} name={log.customers?.name} size={120} />
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center">{log.wash_cycles?.name}</td>
                        <td className="py-1 px-1 border border-slate-200 text-center font-bold">{log.weight_lbs}</td>
                        <td className="py-1 px-1 border border-slate-200 text-center whitespace-nowrap">
                          <button onClick={() => startEdit(log)} className="font-medium text-blue-600 hover:text-blue-800 mr-1">Edit</button>
                          <button onClick={() => deleteLog(log.id)} className="font-medium text-rose-500 hover:text-rose-700">Del</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
