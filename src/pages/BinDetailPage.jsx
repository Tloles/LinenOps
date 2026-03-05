import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_COLORS, statusLabel, BIN_COLORS } from '../lib/constants'
import CustomerLogo from '../components/CustomerLogo'

export default function BinDetailPage() {
  const { id } = useParams()
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [bin, setBin] = useState(null)
  const [events, setEvents] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  async function fetchData() {
    const [binResult, eventsResult] = await Promise.all([
      supabase
        .from('bins')
        .select('*, customers(name, logo_url)')
        .eq('id', id)
        .single(),
      supabase
        .from('scan_events')
        .select('*')
        .eq('bin_id', id)
        .order('scanned_at', { ascending: false }),
    ])

    if (binResult.error) {
      setError(binResult.error.message)
    } else {
      setBin(binResult.data)
    }

    if (eventsResult.data) {
      setEvents(eventsResult.data)
    }

    setLoading(false)
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .order('name')
    if (data) setCustomers(data)
  }

  useEffect(() => {
    fetchData()
    if (role !== 'driver') fetchCustomers()
  }, [id, role])

  async function handleRemoveBin() {
    if (!window.confirm('Are you sure you want to remove this bin?')) return
    setActionLoading(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('record_scan', {
        p_bin_id: id,
        p_status: 'retired',
        p_scanned_by: user.id,
      })
      if (rpcError) throw rpcError
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUndoRemove() {
    setActionLoading(true)
    setError(null)
    try {
      const { error: updateErr } = await supabase
        .from('bins')
        .update({ current_status: 'clean_staged', retired_at: null })
        .eq('id', id)
      if (updateErr) throw updateErr

      await supabase.from('scan_events').insert({
        bin_id: id,
        status: 'clean_staged',
        scanned_by: user.id,
        notes: 'Restored from removed',
      })

      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUpdateColor(colorName) {
    setActionLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('bins')
        .update({ color: colorName || null })
        .eq('id', id)
      if (error) throw error
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUpdateTareWeight(value) {
    setActionLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('bins')
        .update({ tare_weight: value === '' ? null : parseFloat(value) })
        .eq('id', id)
      if (error) throw error
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleChangeCustomer(newCustomerId) {
    setActionLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('bins')
        .update({ customer_id: newCustomerId || null })
        .eq('id', id)
      if (error) throw error
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading bin...</div>
  }

  if (error && !bin) {
    return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  }

  const isRetired = bin.current_status === 'retired'

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/bins')}
        className="min-h-[48px] px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
      >
        &larr; Back to Bins
      </button>

      {/* Bin Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold font-mono text-gray-900">{bin.barcode}</h2>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize ${
              STATUS_COLORS[bin.current_status] || 'bg-gray-100 text-gray-800'
            }`}
          >
            {isRetired ? 'removed' : statusLabel(bin.current_status)}
          </span>
        </div>

        {bin.color && (() => {
          const c = BIN_COLORS.find(bc => bc.name === bin.color)
          return c ? (
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-6 h-6 rounded-full"
                style={{ backgroundColor: c.hex, border: `1px solid ${c.border || c.hex}` }}
              />
              <span className="text-gray-600">{c.name}</span>
            </div>
          ) : null
        })()}

        <p className="text-gray-600 mb-2">
          <span className="font-medium text-gray-700">Tare Weight:</span>{' '}
          {bin.tare_weight != null ? `${bin.tare_weight} lbs` : 'Not set'}
        </p>

        {bin.customers?.name && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CustomerLogo url={bin.customers.logo_url} name={bin.customers.name} size={40} />
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {/* Owner actions */}
        {role !== 'driver' && (
          <div className="mt-6 space-y-4">
            {/* Remove / Undo Remove */}
            {isRetired ? (
              <button
                onClick={handleUndoRemove}
                disabled={actionLoading}
                className="min-h-[48px] px-4 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                {actionLoading ? 'Restoring...' : 'Undo Remove'}
              </button>
            ) : (
              <button
                onClick={handleRemoveBin}
                disabled={actionLoading}
                className="min-h-[48px] px-4 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                {actionLoading ? 'Removing...' : 'Remove Bin'}
              </button>
            )}

            {/* Color */}
            {!isRetired && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-3">
                  {BIN_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      title={c.name}
                      onClick={() => handleUpdateColor(bin.color === c.name ? '' : c.name)}
                      disabled={actionLoading}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
                        bin.color === c.name
                          ? 'ring-3 ring-blue-500 ring-offset-2 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{
                        backgroundColor: c.hex,
                        border: `2px solid ${c.border || c.hex}`,
                      }}
                    >
                      {bin.color === c.name && (
                        <svg className={`w-5 h-5 ${c.name === 'White' || c.name === 'Yellow' ? 'text-gray-700' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tare Weight */}
            {!isRetired && (
              <div>
                <label htmlFor="change-tare-weight" className="block text-sm font-medium text-gray-700 mb-1">
                  Tare Weight (lbs)
                </label>
                <input
                  id="change-tare-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={bin.tare_weight ?? ''}
                  onChange={(e) => handleUpdateTareWeight(e.target.value)}
                  disabled={actionLoading}
                  placeholder="Not set"
                  className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
                />
              </div>
            )}

            {/* Change Customer */}
            {!isRetired && (
              <div>
                <label htmlFor="change-customer" className="block text-sm font-medium text-gray-700 mb-1">
                  Assigned Customer
                </label>
                <select
                  id="change-customer"
                  value={bin.customer_id || ''}
                  onChange={(e) => handleChangeCustomer(e.target.value)}
                  disabled={actionLoading}
                  className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
                >
                  <option value="">No customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scan Event History */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Scan History</h3>

        {events.length === 0 ? (
          <p className="text-gray-500">No scan events recorded.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      STATUS_COLORS[event.status] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {statusLabel(event.status)}
                  </span>
                  {event.notes && (
                    <span className="ml-2 text-sm text-gray-500">{event.notes}</span>
                  )}
                </div>
                <time className="text-sm text-gray-400">
                  {new Date(event.scanned_at).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
