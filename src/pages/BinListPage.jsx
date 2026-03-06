import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_COLORS, statusLabel, BIN_COLORS } from '../lib/constants'
import CustomerLogo from '../components/CustomerLogo'

export default function BinListPage() {
  const { role } = useAuth()
  const [bins, setBins] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Inline add form state
  const [showForm, setShowForm] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [color, setColor] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [tareWeight, setTareWeight] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [showRemoved, setShowRemoved] = useState(false)

  async function fetchBins() {
    let query = supabase
      .from('bins')
      .select('*, customers(name, logo_url)')
      .order('created_at', { ascending: false })

    if (!showRemoved) {
      query = query.is('retired_at', null)
    }

    const { data, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setBins(data)
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
    fetchBins()
    fetchCustomers()
  }, [showRemoved])

  const TARE_WEIGHTS = [135, 145, 155, 163]

  function openAddForm() {
    setBarcode('')
    setColor('')
    setTareWeight('135')
    setCustomerId('')
    setFormError(null)
    setFieldErrors({})
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setFormError(null)
    setFieldErrors({})
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    setFieldErrors({})
    setSaving(true)

    const parsedWeight = parseFloat(tareWeight)
    if (!parsedWeight || parsedWeight <= 0) {
      setFormError('Please enter a Tare Weight before registering this bin.')
      setFieldErrors({ tareWeight: true })
      setSaving(false)
      return
    }

    try {
      const { data: bin, error: binError } = await supabase
        .from('bins')
        .insert({
          barcode,
          color: color || null,
          tare_weight: parsedWeight,
          customer_id: customerId || null,
          current_status: 'clean_staged',
        })
        .select()
        .single()

      if (binError) throw binError

      // Record initial scan event
      await supabase.from('scan_events').insert({
        bin_id: bin.id,
        status: 'clean_staged',
        notes: 'Registration',
      })

      cancelForm()
      await fetchBins()
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('tare_weight') && msg.includes('not-null')) {
        setFormError('Please enter a Tare Weight before registering this bin.')
        setFieldErrors({ tareWeight: true })
      } else if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) {
        setFormError('A bin with this barcode already exists.')
      } else if (msg.includes('not-null') || msg.includes('violates not-null')) {
        setFormError('A required field is missing. Please fill in all required fields.')
      } else if (msg.includes('violates') || msg.includes('constraint')) {
        setFormError('Could not register bin. Please check your inputs and try again.')
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading bins...</div>
  }

  if (error) {
    return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Bins</h2>
        {role !== 'driver' && !showForm && (
          <button
            onClick={openAddForm}
            className="min-h-[48px] inline-flex items-center px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
          >
            + Register Bin
          </button>
        )}
      </div>

      {/* Inline Add Bin Form */}
      {showForm && role !== 'driver' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-5 mb-4 space-y-3">
          <h3 className="font-semibold text-gray-900">Register New Bin</h3>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{formError}</div>
          )}

          <div>
            <label htmlFor="bin-barcode" className="block text-sm font-medium text-gray-700 mb-1">
              Barcode *
            </label>
            <input
              id="bin-barcode"
              type="text"
              required
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or enter barcode"
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

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
                  onClick={() => setColor(color === c.name ? '' : c.name)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    color === c.name
                      ? 'ring-3 ring-blue-500 ring-offset-2 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: c.hex,
                    border: `2px solid ${c.border || c.hex}`,
                  }}
                >
                  {color === c.name && (
                    <svg className={`w-5 h-5 ${c.name === 'White' || c.name === 'Yellow' ? 'text-gray-700' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {color && (
              <p className="text-sm text-gray-500 mt-1">{color}</p>
            )}
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${fieldErrors.tareWeight ? 'text-red-700' : 'text-gray-700'}`}>
              Tare Weight (lbs) *
            </label>
            <div className="flex flex-wrap gap-2">
              {TARE_WEIGHTS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => { setTareWeight(String(w)); setFieldErrors(prev => ({ ...prev, tareWeight: false })) }}
                  className={`min-h-[48px] px-5 text-base font-medium rounded-lg border-2 transition-colors ${
                    tareWeight === String(w)
                      ? 'bg-[#1B2541] text-white border-[#1B2541]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {w}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setTareWeight('other'); setFieldErrors(prev => ({ ...prev, tareWeight: false })) }}
                className={`min-h-[48px] px-5 text-base font-medium rounded-lg border-2 transition-colors ${
                  tareWeight === 'other' || (tareWeight && !TARE_WEIGHTS.includes(Number(tareWeight)))
                    ? 'bg-[#1B2541] text-white border-[#1B2541]'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                Other
              </button>
            </div>
            {(tareWeight === 'other' || (tareWeight && !TARE_WEIGHTS.includes(Number(tareWeight)) && tareWeight !== '')) && (
              <input
                id="bin-tare"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoFocus
                value={tareWeight === 'other' ? '' : tareWeight}
                onChange={(e) => { setTareWeight(e.target.value || 'other'); setFieldErrors(prev => ({ ...prev, tareWeight: false })) }}
                placeholder="Enter weight"
                className={`mt-2 w-full py-3 px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${fieldErrors.tareWeight ? 'border-red-500' : 'border-gray-300'}`}
              />
            )}
          </div>

          <div>
            <label htmlFor="bin-customer" className="block text-sm font-medium text-gray-700 mb-1">
              Customer
            </label>
            <select
              id="bin-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[48px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Registering...' : 'Register Bin'}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="min-h-[48px] px-6 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Show removed toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-500 mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showRemoved}
          onChange={(e) => setShowRemoved(e.target.checked)}
          className="rounded"
        />
        Show removed bins
      </label>

      {/* Bin list */}
      {bins.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-500">
          No bins registered yet.
          {role !== 'driver' && (
            <button onClick={openAddForm} className="block mx-auto mt-2 text-blue-600 hover:underline">
              Register your first bin
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {bins.map((bin) => (
            <Link
              key={bin.id}
              to={`/bins/${bin.id}`}
              className="block bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {bin.color && (() => {
                    const c = BIN_COLORS.find(bc => bc.name === bin.color)
                    return c ? (
                      <span
                        className="inline-block w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.hex, border: `1px solid ${c.border || c.hex}` }}
                        title={c.name}
                      />
                    ) : null
                  })()}
                  <span className="font-mono font-medium text-gray-900">{bin.barcode}</span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                    STATUS_COLORS[bin.current_status] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusLabel(bin.current_status)}
                </span>
              </div>
              {bin.customers?.name && (
                <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-500">
                  <CustomerLogo url={bin.customers.logo_url} name={bin.customers.name} size={28} />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
