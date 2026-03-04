import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CUSTOMER_TYPES, STATUS_COLORS, statusLabel, isWellnessType } from '../lib/constants'
import CustomerLogo from '../components/CustomerLogo'

function typeLabel(type) {
  const found = CUSTOMER_TYPES.find((t) => t.value === type)
  return found ? found.label : type
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { role } = useAuth()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [bins, setBins] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Edit form state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', type: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Logo upload state
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Location form state
  const [showLocForm, setShowLocForm] = useState(false)
  const [editingLocId, setEditingLocId] = useState(null)
  const [locForm, setLocForm] = useState({ name: '', weekly_par: '', deliveries_per_week: '' })
  const [locSaving, setLocSaving] = useState(false)
  const [locError, setLocError] = useState(null)

  async function fetchData() {
    const [custResult, binsResult, locsResult] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('bins').select('*').eq('customer_id', id).is('retired_at', null).order('created_at', { ascending: false }),
      supabase.from('locations').select('*').eq('customer_id', id).order('name'),
    ])

    if (custResult.error) {
      setError(custResult.error.message)
    } else {
      setCustomer(custResult.data)
    }

    if (binsResult.data) {
      setBins(binsResult.data)
    }

    setLocations(locsResult.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  function openEditForm() {
    setForm({
      name: customer.name || '',
      code: customer.code || '',
      type: customer.type || '',
      address: customer.address || '',
    })
    setLogoFile(null)
    setLogoPreview(customer.logo_url || null)
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setFormError(null)
    setLogoFile(null)
    setLogoPreview(null)
  }

  function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo() {
    if (!logoFile) return null
    const fileExt = logoFile.name.split('.').pop()
    const fileName = `${id}.${fileExt}`
    setUploading(true)
    try {
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, { upsert: true })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('logos').getPublicUrl(fileName)
      return data.publicUrl + '?t=' + Date.now()
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)

    const payload = {
      name: form.name,
      code: form.code || null,
      type: form.type || null,
      address: form.address || null,
    }

    try {
      if (logoFile) {
        const logoUrl = await uploadLogo()
        if (logoUrl) payload.logo_url = logoUrl
      }

      const { error } = await supabase.from('customers').update(payload).eq('id', id)
      if (error) throw error

      cancelForm()
      await fetchData()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Location CRUD ──

  function openAddLocation() {
    setEditingLocId(null)
    setLocForm({ name: '', weekly_par: '', deliveries_per_week: '1' })
    setLocError(null)
    setShowLocForm(true)
  }

  function openEditLocation(loc) {
    setEditingLocId(loc.id)
    setLocForm({
      name: loc.name,
      weekly_par: String(loc.weekly_par),
      deliveries_per_week: String(loc.deliveries_per_week),
    })
    setLocError(null)
    setShowLocForm(true)
  }

  function cancelLocForm() {
    setShowLocForm(false)
    setEditingLocId(null)
    setLocError(null)
  }

  async function handleLocSubmit(e) {
    e.preventDefault()
    setLocError(null)
    setLocSaving(true)

    const payload = {
      name: locForm.name,
      weekly_par: parseInt(locForm.weekly_par, 10) || 0,
      deliveries_per_week: parseInt(locForm.deliveries_per_week, 10) || 1,
    }

    try {
      if (editingLocId) {
        const { error } = await supabase.from('locations').update(payload).eq('id', editingLocId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('locations').insert({ ...payload, customer_id: id })
        if (error) throw error
      }

      cancelLocForm()
      await fetchData()
    } catch (err) {
      setLocError(err.message)
    } finally {
      setLocSaving(false)
    }
  }

  async function deleteLocation(locId) {
    const { error } = await supabase.from('locations').delete().eq('id', locId)
    if (error) {
      console.error('Error deleting location:', error)
      return
    }
    await fetchData()
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading customer...</div>
  }

  if (error && !customer) {
    return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  }

  const isWellness = isWellnessType(customer.type)

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/customers')}
        className="min-h-[48px] px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
      >
        &larr; Back to Customers
      </button>

      {/* Customer Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          {customer.logo_url && (
            <img
              src={customer.logo_url}
              alt={customer.name}
              className="w-24 h-24 rounded-lg object-contain shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">{customer.name}</h2>
            <div className="text-sm text-gray-500 mt-1">
              {customer.code && <span className="font-mono">{customer.code}</span>}
              {customer.code && customer.type && <span className="mx-1.5">&middot;</span>}
              {customer.type && <span>{typeLabel(customer.type)}</span>}
            </div>
            {customer.address && (
              <div className="text-sm text-gray-400 mt-1">{customer.address}</div>
            )}
          </div>
          {role === 'owner' && !showForm && (
            <button
              onClick={openEditForm}
              className="min-h-[48px] px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 shrink-0"
            >
              Edit
            </button>
          )}
        </div>

        {/* Inline Edit Form */}
        {showForm && role === 'owner' && (
          <form onSubmit={handleSubmit} className="mt-6 pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-semibold text-gray-900">Edit Customer</h3>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{formError}</div>
            )}

            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input id="edit-name" type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-code" className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input id="edit-code" type="text" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Internal code"
                  className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label htmlFor="edit-type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select id="edit-type" value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                  <option value="">Select type...</option>
                  {CUSTOMER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="edit-address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input id="edit-address" type="text" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Delivery address"
                className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Logo upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
              <div className="flex items-center gap-4">
                {logoPreview && (
                  <img src={logoPreview} alt="Logo preview" className="w-12 h-12 rounded-md object-contain border border-gray-200" />
                )}
                <label className="min-h-[48px] inline-flex items-center px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                  <input type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                </label>
                {logoFile && <span className="text-sm text-gray-500 truncate max-w-[150px]">{logoFile.name}</span>}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving || uploading}
                className="flex-1 min-h-[48px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {uploading ? 'Uploading logo...' : saving ? 'Saving...' : 'Update Customer'}
              </button>
              <button type="button" onClick={cancelForm}
                className="min-h-[48px] px-6 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Locations (wellness customers only) ── */}
      {isWellness && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Locations
              <span className="ml-2 text-sm font-normal text-gray-500">({locations.length})</span>
            </h3>
            {role === 'owner' && !showLocForm && (
              <button
                onClick={openAddLocation}
                className="min-h-[40px] px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Add Location
              </button>
            )}
          </div>

          {/* Location form (add/edit) */}
          {showLocForm && role === 'owner' && (
            <form onSubmit={handleLocSubmit} className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <h4 className="font-medium text-gray-900">
                {editingLocId ? 'Edit Location' : 'New Location'}
              </h4>

              {locError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{locError}</div>
              )}

              <div>
                <label htmlFor="loc-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  id="loc-name"
                  type="text"
                  required
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder="e.g. Downtown, Main St"
                  className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="loc-par" className="block text-sm font-medium text-gray-700 mb-1">Weekly Par</label>
                  <input
                    id="loc-par"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={locForm.weekly_par}
                    onChange={(e) => setLocForm({ ...locForm, weekly_par: e.target.value })}
                    placeholder="0"
                    className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="loc-dpw" className="block text-sm font-medium text-gray-700 mb-1">Deliveries / Week</label>
                  <input
                    id="loc-dpw"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={locForm.deliveries_per_week}
                    onChange={(e) => setLocForm({ ...locForm, deliveries_per_week: e.target.value })}
                    placeholder="1"
                    className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={locSaving}
                  className="flex-1 min-h-[44px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {locSaving ? 'Saving...' : editingLocId ? 'Update Location' : 'Add Location'}
                </button>
                <button
                  type="button"
                  onClick={cancelLocForm}
                  className="min-h-[44px] px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {locations.length === 0 && !showLocForm ? (
            <p className="text-gray-500">No locations yet.</p>
          ) : (
            <div className="space-y-2">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  className="rounded-lg border border-gray-100 p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{loc.name}</p>
                    <p className="text-sm text-gray-500">
                      Par: {loc.weekly_par}/wk &middot; {loc.deliveries_per_week}x/wk &middot;
                      {' '}<span className="font-medium text-blue-700">
                        {Math.ceil(loc.weekly_par / loc.deliveries_per_week)} per delivery
                      </span>
                    </p>
                  </div>
                  {role === 'owner' && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEditLocation(loc)}
                        className="min-h-[36px] px-3 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteLocation(loc.id)}
                        className="min-h-[36px] px-3 text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Bins */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Active Bins
          <span className="ml-2 text-sm font-normal text-gray-500">({bins.length})</span>
        </h3>

        {bins.length === 0 ? (
          <p className="text-gray-500">No active bins assigned to this customer.</p>
        ) : (
          <div className="space-y-2">
            {bins.map((bin) => (
              <Link
                key={bin.id}
                to={`/bins/${bin.id}`}
                className="block rounded-lg border border-gray-100 p-3 hover:bg-gray-50 active:bg-gray-100"
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
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
