import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CustomerLogo from '../components/CustomerLogo'

const CATEGORY_ORDER = ['Flatwork', 'Towels', 'Special Items']

export default function ProductionFormPage() {
  const { user } = useAuth()

  // Step 1 — Scan
  const [scanning, setScanning] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [bin, setBin] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const scannerRef = useRef(null)
  const html5QrRef = useRef(null)

  // Step 2 — Cart numbering
  const [cartNumber, setCartNumber] = useState(1)
  const [totalCarts, setTotalCarts] = useState(1)

  // Step 3 — SKU form (hotel/limited service/specialty)
  const [hotelSkus, setHotelSkus] = useState([])
  const [skuQuantities, setSkuQuantities] = useState({})

  // Step 3 — Wellness
  const [sheetCount, setSheetCount] = useState('')

  // Step 4 — Weight
  const [totalWeight, setTotalWeight] = useState('')
  const [cartWeight, setCartWeight] = useState('')

  // Step 5 — Submit
  const [submitting, setSubmitting] = useState(false)

  // Print data snapshot (frozen on submit for print)
  const [printData, setPrintData] = useState(null)

  const linenWeight = useMemo(() => {
    const tw = parseFloat(totalWeight)
    const cw = parseFloat(cartWeight)
    if (!isNaN(tw) && !isNaN(cw)) return Math.max(0, tw - cw)
    return null
  }, [totalWeight, cartWeight])

  const isHotelType = customer && (customer.type === 'hotel' || customer.type === 'limited_service' || customer.type === 'specialty')
  const isWellness = customer && customer.type === 'wellness'

  // Fetch hotel SKUs once
  useEffect(() => {
    async function fetchSkus() {
      const { data } = await supabase
        .from('hotel_skus')
        .select('*')
        .order('sort_order')
      if (data) setHotelSkus(data)
    }
    fetchSkus()
  }, [])

  // Group SKUs by category
  const skusByCategory = useMemo(() => {
    const groups = {}
    for (const cat of CATEGORY_ORDER) {
      groups[cat] = hotelSkus.filter(s => s.category === cat)
    }
    return groups
  }, [hotelSkus])

  // Scanner helpers
  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop() } catch { /* already stopped */ }
      html5QrRef.current = null
    }
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {})
      }
    }
  }, [])

  async function startScanner() {
    setError(null)
    setBin(null)
    setCustomer(null)
    setSuccess(null)

    const html5Qr = new Html5Qrcode('prod-scanner-region')
    html5QrRef.current = html5Qr
    setScanning(true)

    try {
      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 300, height: 150 }, formatsToSupport: [0] },
        (decodedText) => {
          stopScanner()
          handleBarcodeScan(decodedText)
        },
        () => {}
      )
    } catch {
      setError('Could not start camera. Please check permissions or use manual entry.')
      setScanning(false)
    }
  }

  async function handleBarcodeScan(barcode) {
    setError(null)
    setSuccess(null)
    setBin(null)
    setCustomer(null)
    setLookingUp(true)

    try {
      const { data, error: fetchError } = await supabase
        .from('bins')
        .select('*, customers(id, name, type, logo_url)')
        .eq('barcode', barcode.trim())
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!data) {
        setError(`No bin found with barcode "${barcode}".`)
        return
      }

      setBin(data)
      setCustomer(data.customers)
      // Reset form for new scan
      setCartNumber(1)
      setTotalCarts(1)
      setSkuQuantities({})
      setSheetCount('')
      setTotalWeight('')
      setCartWeight('')
      setPrintData(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLookingUp(false)
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualBarcode.trim()) return
    stopScanner()
    handleBarcodeScan(manualBarcode.trim())
    setManualBarcode('')
  }

  function handleSkuChange(skuId, value) {
    const num = value === '' ? '' : parseInt(value, 10)
    setSkuQuantities(prev => ({ ...prev, [skuId]: isNaN(num) ? '' : num }))
  }

  function incrementSku(skuId) {
    setSkuQuantities(prev => ({ ...prev, [skuId]: (prev[skuId] || 0) + 1 }))
  }

  // Submit
  async function handleSubmit() {
    if (!bin || !customer) return
    setSubmitting(true)
    setError(null)

    const tw = parseFloat(totalWeight) || 0
    const cw = parseFloat(cartWeight) || 0
    const lw = Math.max(0, tw - cw)

    try {
      const logRow = {
        customer_id: customer.id,
        bin_id: bin.id,
        cart_number: cartNumber,
        total_carts: totalCarts,
        total_weight: tw,
        cart_weight: cw,
        linen_weight: lw,
        logged_by: user.id,
      }

      if (isWellness) {
        logRow.sheet_count = parseInt(sheetCount, 10) || 0
      }

      const { data: logData, error: logError } = await supabase
        .from('production_logs')
        .insert(logRow)
        .select()
        .single()

      if (logError) throw logError

      // Insert SKU line items for hotel types
      if (isHotelType) {
        const items = Object.entries(skuQuantities)
          .filter(([, qty]) => qty > 0)
          .map(([skuId, qty]) => ({
            production_log_id: logData.id,
            hotel_sku_id: skuId,
            quantity: qty,
          }))

        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from('production_log_items')
            .insert(items)
          if (itemsError) throw itemsError
        }
      }

      // Freeze print data before resetting form
      if (isHotelType) {
        const filledSkus = hotelSkus
          .filter(s => skuQuantities[s.id] > 0)
          .map(s => ({ ...s, quantity: skuQuantities[s.id] }))

        setPrintData({
          customerName: customer.name,
          customerLogoUrl: customer.logo_url,
          cartNumber,
          totalCarts,
          totalWeight: tw,
          cartWeight: cw,
          linenWeight: lw,
          skus: filledSkus,
          date: new Date().toLocaleDateString(),
        })
      }

      setSuccess('Production log saved!')

      // Reset form for next cart
      setSkuQuantities({})
      setSheetCount('')
      setTotalWeight('')
      setCartWeight('')
      setCartNumber(prev => prev + 1)

      // Auto-print for hotel types
      if (isHotelType) {
        setTimeout(() => window.print(), 500)
      }

      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function resetScan() {
    setBin(null)
    setCustomer(null)
    setSuccess(null)
    setError(null)
    setPrintData(null)
  }

  const canSubmit = bin && customer && !submitting && (
    isWellness ? sheetCount !== '' : true
  )

  return (
    <>
      {/* Main content — hidden when printing */}
      <div className="space-y-4 print:hidden">
        <h2 className="text-lg font-semibold text-gray-900">Production Form</h2>

        {/* Success */}
        {success && (
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 font-medium text-center text-lg">
            {success}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {lookingUp && (
          <div className="text-center py-8 text-gray-500">Looking up bin...</div>
        )}

        {/* Step 1 — Scan (shown when no bin selected) */}
        {!bin && !lookingUp && (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div
                id="prod-scanner-region"
                ref={scannerRef}
                className={scanning ? 'w-full' : 'hidden'}
              />
              {!scanning && (
                <button
                  onClick={startScanner}
                  className="w-full min-h-[140px] flex flex-col items-center justify-center gap-3 text-blue-600 hover:bg-blue-50 active:bg-blue-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10M12 7v10" />
                  </svg>
                  <span className="text-xl font-semibold">Tap to Scan Cart Barcode</span>
                </button>
              )}
              {scanning && (
                <button
                  onClick={stopScanner}
                  className="w-full min-h-[48px] bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                >
                  Stop Scanner
                </button>
              )}
            </div>

            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Or type barcode manually..."
                className="flex-1 py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                className="min-h-[48px] px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                Look Up
              </button>
            </form>
          </>
        )}

        {/* Bin found — show form */}
        {bin && customer && (
          <div className="space-y-4">
            {/* Customer info card */}
            <div className="bg-white rounded-lg border-2 border-blue-200 p-5">
              <div className="flex items-center gap-3 mb-2">
                <CustomerLogo url={customer.logo_url} name={customer.name} size={60} />
                <div>
                  <p className="text-xl font-bold text-gray-900">{customer.name}</p>
                  <p className="text-sm text-gray-500 font-mono">{bin.barcode}</p>
                </div>
              </div>
            </div>

            {/* Step 2 — Cart numbering */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Cart Numbering</label>
              <div className="flex items-center gap-3 text-lg font-medium text-gray-700">
                <span>Cart</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={cartNumber}
                  onChange={(e) => setCartNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-20 min-h-[48px] border border-gray-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span>of</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={totalCarts}
                  onChange={(e) => setTotalCarts(parseInt(e.target.value, 10) || 1)}
                  className="w-20 min-h-[48px] border border-gray-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Step 3 — SKU form (hotel/limited service/specialty) */}
            {isHotelType && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                <label className="block text-sm font-semibold text-gray-700">SKU Count Sheet</label>
                {CATEGORY_ORDER.map(category => {
                  const skus = skusByCategory[category]
                  if (!skus || skus.length === 0) return null
                  return (
                    <div key={category}>
                      <h3 className="text-sm font-bold text-[#1B2541] uppercase tracking-wider border-b border-gray-200 pb-1 mb-2">
                        {category}
                      </h3>
                      <div className="space-y-2">
                        {skus.map(sku => (
                          <div key={sku.id} className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-medium text-gray-900 truncate">{sku.name}</p>
                              {sku.name_es && (
                                <p className="text-sm italic text-gray-400 truncate">{sku.name_es}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => incrementSku(sku.id)}
                              className="min-h-[48px] w-20 border border-gray-300 rounded-lg text-center text-lg font-bold text-gray-900 bg-gray-50 active:bg-blue-50 flex items-center justify-center"
                            >
                              {skuQuantities[sku.id] || 0}
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={skuQuantities[sku.id] ?? ''}
                              onChange={(e) => handleSkuChange(sku.id, e.target.value)}
                              className="w-20 min-h-[48px] border border-gray-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Step 3 — Wellness: sheet count */}
            {isWellness && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Total Sheet Count</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={sheetCount}
                  onChange={(e) => setSheetCount(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[48px] border border-gray-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Step 4 — Weight section */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Weights (lbs)</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Total Weight</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[48px] border border-gray-300 rounded-lg px-4 py-3 text-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cart Weight</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={cartWeight}
                    onChange={(e) => setCartWeight(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[48px] border border-gray-300 rounded-lg px-4 py-3 text-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Linen Weight</label>
                  <div className="w-full min-h-[48px] border border-gray-200 bg-gray-50 rounded-lg px-4 py-3 text-xl font-bold text-center text-gray-700">
                    {linenWeight !== null ? linenWeight : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5 — Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full min-h-[56px] rounded-lg text-lg font-bold text-white ${
                canSubmit ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800' : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Saving...' : 'Submit Production Log'}
            </button>

            {/* Scan another */}
            <button
              onClick={resetScan}
              className="w-full min-h-[48px] text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Scan Another Cart
            </button>
          </div>
        )}
      </div>

      {/* Print layout — hidden on screen, shown on print */}
      {printData && (
        <div className="hidden print:block p-8">
          <div className="max-w-lg mx-auto">
            {/* Header */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
              <img src="/header-logo.png" alt="White Sail" className="h-16 mx-auto mb-2" />
              <p className="text-lg font-bold">Client: {printData.customerName}</p>
              <p className="text-sm">Date: {printData.date}</p>
              <p className="text-sm font-semibold">Cart {printData.cartNumber} of {printData.totalCarts}</p>
            </div>

            {/* SKU table */}
            {printData.skus.length > 0 && (
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr>
                    <th className="text-left py-1 px-2 border-b-2 border-gray-800 font-bold uppercase text-sm">Item</th>
                    <th className="text-right py-1 px-2 border-b-2 border-gray-800 font-bold uppercase text-sm w-20">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORY_ORDER.map(category => {
                    const catSkus = printData.skus.filter(s => s.category === category)
                    if (catSkus.length === 0) return null
                    return (
                      <tr key={category}>
                        <td colSpan={2} className="pt-3 pb-1 px-2">
                          <table className="w-full">
                            <tbody>
                              <tr>
                                <td colSpan={2} className="font-bold uppercase text-xs tracking-wider text-gray-600 pb-1 border-b border-gray-300">
                                  {category}
                                </td>
                              </tr>
                              {catSkus.map(sku => (
                                <tr key={sku.id}>
                                  <td className="py-1 px-2 text-sm">{sku.name}</td>
                                  <td className="py-1 px-2 text-sm text-right font-bold w-20">{sku.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Weights */}
            <div className="border-t-2 border-gray-800 pt-3 space-y-1 text-sm">
              <p><span className="font-semibold">Total Weight:</span> {printData.totalWeight} lbs</p>
              <p><span className="font-semibold">Cart Weight:</span> {printData.cartWeight} lbs</p>
              <p><span className="font-semibold">Linen Weight:</span> {printData.linenWeight} lbs</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
