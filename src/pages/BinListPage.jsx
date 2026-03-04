import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_COLORS, statusLabel } from '../lib/constants'
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
  const [description, setDescription] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
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

  function openAddForm() {
    setBarcode('')
    setDescription('')
    setCustomerId('')
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setFormError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)

    try {
      const { data: bin, error: binError } = await supabase
        .from('bins')
        .insert({
          barcode,
          description: description || null,
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
      setFormError(err.message)
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
        {role === 'owner' && !showForm && (
          <button
            onClick={openAddForm}
            className="min-h-[48px] inline-flex items-center px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
          >
            + Register Bin
          </button>
        )}
      </div>

      {/* Inline Add Bin Form */}
      {showForm && role === 'owner' && (
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
            <label htmlFor="bin-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              id="bin-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
          {role === 'owner' && (
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
                  <span className="font-mono font-medium text-gray-900">{bin.barcode}</span>
                  {bin.description && (
                    <span className="text-sm text-gray-500">{bin.description}</span>
                  )}
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
