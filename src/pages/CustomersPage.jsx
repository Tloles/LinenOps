import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CUSTOMER_TYPES } from '../lib/constants'
import CustomerLogo from '../components/CustomerLogo'

function typeLabel(type) {
  const found = CUSTOMER_TYPES.find((t) => t.value === type)
  return found ? found.label : type
}

const emptyForm = { name: '', code: '', type: '', address: '' }

export default function CustomersPage() {
  const { role } = useAuth()
  const [customers, setCustomers] = useState([])
  const [binCounts, setBinCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Add form state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Logo upload state
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function fetchData() {
    const [custResult, binsResult] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('bins').select('customer_id').is('retired_at', null).not('customer_id', 'is', null),
    ])

    if (custResult.error) {
      setError(custResult.error.message)
    } else {
      setCustomers(custResult.data)
    }

    if (binsResult.data) {
      const counts = {}
      for (const bin of binsResult.data) {
        counts[bin.customer_id] = (counts[bin.customer_id] || 0) + 1
      }
      setBinCounts(counts)
    }

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function openAddForm() {
    setForm(emptyForm)
    setLogoFile(null)
    setLogoPreview(null)
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setForm(emptyForm)
    setLogoFile(null)
    setLogoPreview(null)
    setFormError(null)
  }

  function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo(customerId) {
    if (!logoFile) return null
    const fileExt = logoFile.name.split('.').pop()
    const fileName = `${customerId}.${fileExt}`
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
      const { data: newCustomer, error } = await supabase
        .from('customers')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error

      if (logoFile) {
        const logoUrl = await uploadLogo(newCustomer.id)
        if (logoUrl) {
          const { error: updateErr } = await supabase
            .from('customers')
            .update({ logo_url: logoUrl })
            .eq('id', newCustomer.id)
          if (updateErr) throw updateErr
        }
      }

      cancelForm()
      await fetchData()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading customers...</div>
  }

  if (error) {
    return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Customers</h2>
        {role === 'owner' && !showForm && (
          <button
            onClick={openAddForm}
            className="min-h-[48px] inline-flex items-center px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
          >
            + Add Customer
          </button>
        )}
      </div>

      {/* Inline Add Form */}
      {showForm && role === 'owner' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-5 mb-4 space-y-3">
          <h3 className="font-semibold text-gray-900">Add Customer</h3>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{formError}</div>
          )}

          <div>
            <label htmlFor="cust-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input id="cust-name" type="text" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name"
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cust-code" className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input id="cust-code" type="text" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Internal code"
                className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label htmlFor="cust-type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select id="cust-type" value={form.type}
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
            <label htmlFor="cust-address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input id="cust-address" type="text" value={form.address}
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
              {uploading ? 'Uploading logo...' : saving ? 'Saving...' : 'Add Customer'}
            </button>
            <button type="button" onClick={cancelForm}
              className="min-h-[48px] px-6 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Customer list */}
      {customers.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-500">
          No customers yet.
          {role === 'owner' && (
            <button onClick={openAddForm} className="block mx-auto mt-2 text-blue-600 hover:underline">
              Add your first customer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((customer) => {
            const count = binCounts[customer.id] || 0
            return (
              <Link
                key={customer.id}
                to={`/customers/${customer.id}`}
                className="block bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 active:bg-gray-100"
              >
                <div className="flex items-center gap-3">
                  <CustomerLogo url={customer.logo_url} name={customer.name} size={48} />
                  <div className="flex-1 min-w-0">
                    {!customer.logo_url && <div className="font-medium text-gray-900">{customer.name}</div>}
                    <div className="text-sm text-gray-500 mt-0.5">
                      {customer.code && <span className="font-mono">{customer.code}</span>}
                      {customer.code && customer.type && <span className="mx-1.5">&middot;</span>}
                      {customer.type && <span>{typeLabel(customer.type)}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm text-gray-500">
                    {count} {count === 1 ? 'bin' : 'bins'}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
