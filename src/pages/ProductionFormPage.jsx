import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CustomerLogo from '../components/CustomerLogo'

const CATEGORY_ORDER = ['Flatwork', 'Towels', 'Special Items']

const PRINT_SKUS = {
  Flatwork: [
    { key: 'duvet_king', name: 'Duvet – King Size', name_es: 'Funda de Edredón– Rey Talla' },
    { key: 'duvet_queen', name: 'Duvet – Queen Size', name_es: 'Funda de Edredón– Reina Talla' },
    { key: 'flat_sheet_king', name: 'Flat Sheet – King Size', name_es: 'Sábana plana – Rey Talla' },
    { key: 'flat_sheet_queen', name: 'Flat Sheet – Queen Size', name_es: 'Sábana plana – Reina Talla' },
    { key: 'pillow_case_king', name: 'Pillow Case – King Size', name_es: 'Funda de almohada – Rey Talla' },
    { key: 'pillow_case_queen', name: 'Pillow Case – Queen Size', name_es: 'Funda de almohada – Reina Talla' },
    { key: 'fitted_sheet', name: 'Fitted Sheet', name_es: 'Sábana elástico' },
  ],
  Towels: [
    { key: 'bath_towel', name: 'Bath Towel', name_es: 'Toalla de baño' },
    { key: 'hand_towel', name: 'Hand Towel', name_es: 'Toalla de mano' },
    { key: 'wash_cloth', name: 'Wash Cloth', name_es: 'Toalla de lavado' },
    { key: 'bath_mat', name: 'Bath Mat', name_es: 'Alfombra de baño' },
    { key: 'pool_towel', name: 'Pool Towel', name_es: 'Toalla de piscina' },
  ],
  'Special Items': [
    { key: 'comforter', name: 'Comforter', name_es: 'Edredón' },
    { key: 'shower_curtain', name: 'Shower Curtain', name_es: 'Cortina de la ducha' },
    { key: 'pillow', name: 'Pillow', name_es: 'Almohada' },
    { key: 'blanket', name: 'Blanket', name_es: 'Cobjia' },
    { key: 'robe', name: 'Robe', name_es: 'Bata' },
    { key: 'bed_skirt', name: 'Bed Skirt', name_es: 'Faldón' },
  ],
}

// Flat list of all SKUs with their category
const ALL_SKUS = CATEGORY_ORDER.flatMap(cat =>
  PRINT_SKUS[cat].map(item => ({ ...item, category: cat }))
)

// Pre-computed pairs by category for rendering
const SKU_PAIRS_BY_CATEGORY = {}
for (const cat of CATEGORY_ORDER) {
  SKU_PAIRS_BY_CATEGORY[cat] = chunkPairs(PRINT_SKUS[cat])
}

function chunkPairs(arr) {
  const pairs = []
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push([arr[i], arr[i + 1] || null])
  }
  return pairs
}

function todayFormatted() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

/* Shared table cell styles */
const cellBorder = 'border border-gray-400'
const cellPad = 'px-2 py-2'

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

  // Step 2 — SKU form (hotel/limited service/specialty)
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

  // Recent logs
  const [recentLogs, setRecentLogs] = useState([])
  const [reprinting, setReprinting] = useState(false)

  // Edit mode
  const [editingId, setEditingId] = useState(null)

  const linenWeight = useMemo(() => {
    const tw = parseFloat(totalWeight)
    const cw = parseFloat(cartWeight)
    if (!isNaN(tw) && !isNaN(cw)) return Math.max(0, tw - cw)
    return null
  }, [totalWeight, cartWeight])

  const isHotelType = customer && (customer.type === 'hotel' || customer.type === 'limited_service' || customer.type === 'specialty')
  const isWellness = customer && customer.type === 'wellness'

  // Fetch recent production logs (last 24h)
  const fetchRecentLogs = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    console.log('[fetchRecentLogs] since:', since)
    const { data, error: fetchErr } = await supabase
      .from('production_logs')
      .select('id, total_weight, cart_weight, linen_weight, customer_id, bin_id, created_at, customers(id, name, type, logo_url), bins(id, barcode, tare_weight)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    console.log('[fetchRecentLogs] error:', fetchErr, 'data:', data)
    if (data) setRecentLogs(data)
  }, [])

  useEffect(() => {
    fetchRecentLogs()
  }, [fetchRecentLogs])

  // Reprint a past log
  async function handleReprint(log) {
    setReprinting(true)
    try {
      const custType = log.customers?.type
      const isHotel = custType === 'hotel' || custType === 'limited_service' || custType === 'specialty'

      if (isHotel) {
        // Fetch line items for this log
        const { data: items } = await supabase
          .from('production_log_items')
          .select('sku_key, quantity')
          .eq('production_log_id', log.id)

        const qtyMap = {}
        if (items) {
          for (const item of items) {
            qtyMap[item.sku_key] = item.quantity
          }
        }

        const printPairs = {}
        for (const cat of CATEGORY_ORDER) {
          const withQty = PRINT_SKUS[cat].map(s => ({ ...s, quantity: qtyMap[s.key] || 0 }))
          printPairs[cat] = chunkPairs(withQty)
        }

        setPrintData({
          customerName: log.customers?.name || '',
          customerLogoUrl: log.customers?.logo_url,
          totalWeight: log.total_weight || 0,
          cartWeight: log.cart_weight || 0,
          linenWeight: log.linen_weight || 0,
          skuPairs: printPairs,
          date: new Date(log.created_at).toLocaleDateString(),
          barcode: log.bins?.barcode || '',
        })

        setTimeout(() => window.print(), 400)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setReprinting(false)
    }
  }

  // Edit a past log — pre-fill the form
  async function handleEdit(log) {
    setError(null)
    setSuccess(null)
    setPrintData(null)

    // Set customer/bin from log data
    setCustomer(log.customers)
    setBin(log.bins ? { id: log.bins.id, barcode: log.bins.barcode, tare_weight: log.bins.tare_weight, customers: log.customers } : { id: log.bin_id, customers: log.customers })
    setTotalWeight(log.total_weight ? String(log.total_weight) : '')
    setCartWeight(log.cart_weight ? String(log.cart_weight) : (log.bins?.tare_weight ? String(log.bins.tare_weight) : ''))
    setSheetCount('')
    setEditingId(log.id)

    // Fetch SKU quantities for hotel types
    const custType = log.customers?.type
    const isHotel = custType === 'hotel' || custType === 'limited_service' || custType === 'specialty'
    if (isHotel) {
      const { data: items } = await supabase
        .from('production_log_items')
        .select('sku_key, quantity')
        .eq('production_log_id', log.id)

      const qtyMap = {}
      if (items) {
        for (const item of items) {
          qtyMap[item.sku_key] = item.quantity
        }
      }
      setSkuQuantities(qtyMap)
    } else {
      setSkuQuantities({})
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Delete a log with confirmation
  async function handleDelete(log) {
    if (!window.confirm('Are you sure you want to delete this production log?')) return
    try {
      // Delete line items first
      await supabase
        .from('production_log_items')
        .delete()
        .eq('production_log_id', log.id)

      const { error: delError } = await supabase
        .from('production_logs')
        .delete()
        .eq('id', log.id)

      if (delError) throw delError
      setSuccess('Production log deleted.')
      fetchRecentLogs()
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
    }
  }

  function formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

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
      setSkuQuantities({})
      setSheetCount('')
      setTotalWeight('')
      setCartWeight(data.tare_weight ? String(data.tare_weight) : '')
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

  // Submit
  async function handleSubmit() {
    if (!bin || !customer) return

    // Zero-quantity confirmation for hotel types
    if (isHotelType && !Object.values(skuQuantities).some(q => q > 0)) {
      if (!window.confirm('No items have been counted. Are you sure you want to submit?')) return
    }

    setSubmitting(true)
    setError(null)

    const tw = parseFloat(totalWeight) || 0
    const cw = parseFloat(cartWeight) || 0
    const lw = Math.max(0, tw - cw)

    try {
      // ── Invoice calculation ──
      let invoiceAmount = 0
      let linenChargeVal = 0
      let specialtyChargeVal = 0

      const { data: pricing, error: pricingError } = await supabase
        .from('customer_pricing')
        .select('*')
        .eq('customer_id', customer.id)
        .maybeSingle()

      console.log('[Invoice] customer_pricing fetch:', { pricing, pricingError, customerId: customer.id })

      if (pricing) {
        console.log('[Invoice] billing_type:', pricing.billing_type, 'rate_per_lb:', pricing.rate_per_lb, 'lw:', lw)
        if (pricing.billing_type === 'weight') {
          linenChargeVal = lw * (pricing.rate_per_lb || 0)
          console.log('[Invoice] linenChargeVal:', linenChargeVal)

          // Fetch specialty pricing for Special Items category
          const { data: specialtyRates, error: specError } = await supabase
            .from('specialty_pricing')
            .select('*')

          console.log('[Invoice] specialty_pricing fetch:', { specialtyRates, specError })

          if (specialtyRates) {
            for (const sku of PRINT_SKUS['Special Items']) {
              const qty = skuQuantities[sku.key] || 0
              if (qty > 0) {
                const rate = specialtyRates.find(r => r.sku_name === sku.name)
                console.log('[Invoice] specialty match:', { skuName: sku.name, qty, rate })
                if (rate) specialtyChargeVal += qty * rate.price_per_piece
              }
            }
          }

          invoiceAmount = linenChargeVal + specialtyChargeVal
        } else if (pricing.billing_type === 'piece') {
          if (isWellness) {
            const sc = parseInt(sheetCount, 10) || 0
            invoiceAmount = sc * (pricing.piece_rate || 0)
          } else {
            // Find the SKU matching piece_item name
            const pieceSku = ALL_SKUS.find(s => s.name === pricing.piece_item)
            if (pieceSku) {
              const qty = skuQuantities[pieceSku.key] || 0
              invoiceAmount = qty * (pricing.piece_rate || 0)
            }
          }
          linenChargeVal = invoiceAmount
          specialtyChargeVal = 0
        }
      }

      console.log('[Invoice] FINAL:', { invoiceAmount, linenChargeVal, specialtyChargeVal })

      const logRow = {
        customer_id: customer.id,
        bin_id: bin.id,
        total_weight: tw,
        cart_weight: cw,
        linen_weight: lw,
        logged_by: user.id,
        invoice_amount: invoiceAmount,
        linen_charge: linenChargeVal,
        specialty_charge: specialtyChargeVal,
      }

      let logId

      if (editingId) {
        // Update existing log
        const { error: logError } = await supabase
          .from('production_logs')
          .update(logRow)
          .eq('id', editingId)

        if (logError) throw logError
        logId = editingId

        // Delete old line items, then re-insert
        await supabase
          .from('production_log_items')
          .delete()
          .eq('production_log_id', editingId)
      } else {
        // Insert new log
        const { data: logData, error: logError } = await supabase
          .from('production_logs')
          .insert(logRow)
          .select()
          .single()

        if (logError) throw logError
        logId = logData.id
      }

      // Insert SKU line items for hotel types
      if (isHotelType) {
        const items = Object.entries(skuQuantities)
          .filter(([, qty]) => qty > 0)
          .map(([skuKey, qty]) => ({
            production_log_id: logId,
            sku_key: skuKey,
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
        const printPairs = {}
        for (const cat of CATEGORY_ORDER) {
          const withQty = PRINT_SKUS[cat].map(s => ({ ...s, quantity: skuQuantities[s.key] || 0 }))
          printPairs[cat] = chunkPairs(withQty)
        }

        setPrintData({
          customerName: customer.name,
          customerLogoUrl: customer.logo_url,
          totalWeight: tw,
          cartWeight: cw,
          linenWeight: lw,
          skuPairs: printPairs,
          date: todayFormatted(),
          barcode: bin?.barcode || '',
        })
      }

      setSuccess(editingId ? 'Production log updated!' : 'Production log saved!')
      fetchRecentLogs()

      // Reset form for next cart
      setSkuQuantities({})
      setSheetCount('')
      setTotalWeight('')
      setCartWeight('')
      if (editingId) {
        setEditingId(null)
        setBin(null)
        setCustomer(null)
      }

      // Auto-print for hotel types (new submissions only, not edits)
      if (isHotelType && !editingId) {
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

  /* ── Look up Spanish translation from PRINT_SKUS by name ── */
  function getSpanish(name) {
    for (const cat of CATEGORY_ORDER) {
      const item = PRINT_SKUS[cat]?.find(s => s.name === name)
      if (item) return item.name_es
    }
    return null
  }

  /* ── Renders a SKU table row (2 items side by side) ── */
  function renderSkuRow(pair, idx) {
    const left = pair[0]
    const right = pair[1]
    const leftEs = left.name_es || getSpanish(left.name)
    const rightEs = right ? (right.name_es || getSpanish(right.name)) : null
    return (
      <tr key={idx}>
        {/* Left item name */}
        <td className={`${cellBorder} ${cellPad} text-center align-middle`}>
          <span className="text-sm font-bold">{left.name}</span>
          {leftEs && <br />}
          {leftEs && <span className="text-xs italic text-gray-500">{leftEs}</span>}
        </td>
        {/* Left count input */}
        <td className={`${cellBorder} p-1 text-center align-middle w-16`}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={skuQuantities[left.key] ?? ''}
            onChange={(e) => handleSkuChange(left.key, e.target.value)}
            placeholder=""
            className="w-full h-12 text-center text-lg font-bold border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          />
        </td>
        {/* Right item name (or shaded empty cell) */}
        {right ? (
          <td className={`${cellBorder} ${cellPad} text-center align-middle`}>
            <span className="text-sm font-bold">{right.name}</span>
            {rightEs && <br />}
            {rightEs && <span className="text-xs italic text-gray-500">{rightEs}</span>}
          </td>
        ) : (
          <td className={`${cellBorder} bg-gray-200`} />
        )}
        {/* Right count input (or shaded empty cell) */}
        {right ? (
          <td className={`${cellBorder} p-1 text-center align-middle w-16`}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={skuQuantities[right.key] ?? ''}
              onChange={(e) => handleSkuChange(right.key, e.target.value)}
              placeholder=""
              className="w-full h-12 text-center text-lg font-bold border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            />
          </td>
        ) : (
          <td className={`${cellBorder} bg-gray-200 w-16`} />
        )}
      </tr>
    )
  }

  return (
    <>
      {/* ════════════ SCREEN FORM ════════════ */}
      <div className="space-y-4 no-print">
        <h2 className="text-lg font-semibold text-gray-900">Production Form</h2>

        {success && (
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 font-medium text-center text-lg">
            {success}
          </div>
        )}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}
        {lookingUp && (
          <div className="text-center py-8 text-gray-500">Looking up bin...</div>
        )}

        {/* ── Step 1: Scan ── */}
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

        {/* ── Bin found: Cart sheet form ── */}
        {bin && customer && (
          <div className="space-y-4">

            {/* Header: CLIENT+DATE+CART | Title | Customer logo */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="grid grid-cols-3 items-center gap-2">
                <div className="space-y-1">
                  <p className="text-lg">
                    <span className="font-bold">CLIENT:</span>{' '}
                    <span className="text-gray-800 underline underline-offset-4 decoration-gray-300">{customer.name}</span>
                  </p>
                  <p className="text-lg">
                    <span className="font-bold">DATE:</span>{' '}
                    <span className="text-gray-800 underline underline-offset-4 decoration-gray-300">{todayFormatted()}</span>
                  </p>
                  <p className="text-lg">
                    <span className="font-bold">CART:</span>{' '}
                    <span className="text-gray-800 underline underline-offset-4 decoration-gray-300">{bin.barcode}</span>
                  </p>
                </div>
                <h3 className="text-[28px] font-bold text-gray-900 text-center">Linen Cart Manifest</h3>
                <div className="flex justify-end">
                  {customer.logo_url ? (
                    <img src={customer.logo_url} alt={customer.name} style={{ height: 90, objectFit: 'contain' }} />
                  ) : (
                    <span className="font-medium text-gray-700 text-lg">{customer.name}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Tare weight warning */}
            {bin && !bin.tare_weight && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                No tare weight on file for this bin.
              </div>
            )}

            {/* ── SKU table (hotel/limited service/specialty) ── */}
            {isHotelType && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {CATEGORY_ORDER.map(category => {
                      const pairs = SKU_PAIRS_BY_CATEGORY[category]
                      if (!pairs || pairs.length === 0) return null
                      return [
                        /* Category header row */
                        <tr key={`hdr-${category}`}>
                          <td colSpan={4} className={`${cellBorder} text-center py-2`}>
                            <span className="text-base font-bold text-gray-900">{category}</span>
                          </td>
                        </tr>,
                        /* SKU pair rows */
                        ...pairs.map((pair, idx) => renderSkuRow(pair, `${category}-${idx}`))
                      ]
                    })}
                    {/* Weight row — 6 columns matching physical form */}
                    <tr>
                      <td colSpan={4} className="p-0">
                        <table className="w-full border-collapse">
                          <tbody>
                            <tr>
                              <td className={`${cellBorder} ${cellPad} text-center align-middle`}>
                                <span className="text-sm font-bold">TOTAL<br />WEIGHT</span>
                              </td>
                              <td className={`${cellBorder} p-1 align-middle`} style={{ width: '16%' }}>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  value={totalWeight}
                                  onChange={(e) => setTotalWeight(e.target.value)}
                                  placeholder=""
                                  className="w-full h-12 text-center text-lg font-bold border-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                                />
                              </td>
                              <td className={`${cellBorder} ${cellPad} text-center align-middle`}>
                                <span className="text-sm font-bold">CART<br />WEIGHT</span>
                              </td>
                              <td className={`${cellBorder} p-1 align-middle`} style={{ width: '16%' }}>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  value={cartWeight}
                                  onChange={(e) => setCartWeight(e.target.value)}
                                  placeholder=""
                                  className="w-full h-12 text-center text-lg font-bold border-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                                />
                              </td>
                              <td className={`${cellBorder} ${cellPad} text-center align-middle`}>
                                <span className="text-sm font-bold">LINEN<br />WEIGHT</span>
                              </td>
                              <td className={`${cellBorder} ${cellPad} text-center align-middle`} style={{ width: '16%' }}>
                                <span className="text-lg font-bold">{linenWeight !== null ? linenWeight : '—'}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Wellness: sheet count + weights ── */}
            {isWellness && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                <div>
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
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 text-center">Total Weight</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={totalWeight}
                      onChange={(e) => setTotalWeight(e.target.value)}
                      placeholder="0"
                      className="w-full min-h-[48px] border border-gray-300 rounded-lg px-2 py-2 text-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 text-center">Cart Weight</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={cartWeight}
                      onChange={(e) => setCartWeight(e.target.value)}
                      placeholder="0"
                      className="w-full min-h-[48px] border border-gray-300 rounded-lg px-2 py-2 text-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 text-center">Linen Weight</label>
                    <div className="w-full min-h-[48px] border border-gray-200 bg-gray-50 rounded-lg px-2 py-2 text-xl font-bold text-center text-gray-700 flex items-center justify-center">
                      {linenWeight !== null ? linenWeight : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full min-h-[56px] rounded-lg text-lg font-bold text-white ${
                canSubmit ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800' : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Saving...' : editingId ? 'Update Production Log' : 'Submit Production Log'}
            </button>

            <button
              onClick={() => { resetScan(); setEditingId(null) }}
              className="w-full min-h-[48px] text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              {editingId ? 'Cancel Edit' : 'Scan Another Cart'}
            </button>
          </div>
        )}

        {/* ── Recent Production Logs (last 24h) ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider">Recent Production Logs</h3>
          {recentLogs.length === 0 ? (
            <p className="text-gray-400 text-sm">No production logs in the last 24 hours.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-lg border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-slate-100 text-center text-base font-bold text-[#1B2541] uppercase">
                    <th className="py-2 px-1 border border-slate-200" style={{ width: '12%' }}>Time</th>
                    <th className="py-2 px-1 border border-slate-200" style={{ width: '22%' }}>Customer</th>
                    <th className="py-2 px-1 border border-slate-200" style={{ width: '14%' }}>Linen lbs</th>
                    <th className="py-2 px-1 border border-slate-200" style={{ width: '22%' }}>Reprint</th>
                    <th className="py-2 px-1 border border-slate-200" style={{ width: '30%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log, idx) => {
                    const custType = log.customers?.type
                    const canReprint = custType === 'hotel' || custType === 'limited_service' || custType === 'specialty'
                    return (
                      <tr
                        key={log.id}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        <td className="py-1 px-1 border border-slate-200 text-center text-gray-500 whitespace-nowrap text-base">
                          {formatTime(log.created_at)}
                        </td>
                        <td className="py-1 px-1 border border-slate-200">
                          <div className="flex justify-center">
                            <CustomerLogo url={log.customers?.logo_url} name={log.customers?.name} size={80} />
                          </div>
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center font-bold text-base">
                          {log.linen_weight}
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center align-middle">
                          {canReprint && (
                            <button
                              onClick={() => handleReprint(log)}
                              disabled={reprinting}
                              className="min-h-[44px] px-4 py-2 text-base font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
                            >
                              Reprint
                            </button>
                          )}
                        </td>
                        <td className="py-1 px-1 border border-slate-200 text-center align-middle">
                          <div className="flex justify-center" style={{ gap: '25px' }}>
                            <button
                              onClick={() => handleEdit(log)}
                              className="min-h-[44px] px-3 py-2 text-base font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(log)}
                              className="min-h-[44px] px-3 py-2 text-base font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ════════════ PRINT LAYOUT ════════════ */}
      {printData && (
        <div className="print-only p-4">
          <div className="max-w-2xl mx-auto">
            {/* Header: CLIENT+DATE+CART | Title | Customer logo */}
            <div className="mb-2" style={{ display: 'flex', alignItems: 'center', fontSize: '16px' }}>
              <div style={{ flex: 1 }}>
                <p className="mb-0.5">
                  <span className="font-bold">CLIENT:</span>{' '}
                  <span className="underline underline-offset-4">{printData.customerName}</span>
                </p>
                <p className="mb-0.5">
                  <span className="font-bold">DATE:</span>{' '}
                  <span className="underline underline-offset-4">{printData.date}</span>
                </p>
                <p>
                  <span className="font-bold">CART:</span>{' '}
                  <span className="underline underline-offset-4">{printData.barcode}</span>
                </p>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h1 className="font-bold" style={{ fontSize: '24px', margin: 0 }}>Linen Cart Manifest</h1>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                {printData.customerLogoUrl && (
                  <img src={printData.customerLogoUrl} alt={printData.customerName} style={{ height: 80, objectFit: 'contain', display: 'inline-block' }} />
                )}
              </div>
            </div>

            {/* SKU table — exact replica of physical form */}
            <table className="w-full border-collapse border border-black text-sm">
              <tbody>
                {CATEGORY_ORDER.map(category => {
                  const items = PRINT_SKUS[category]
                  if (!items || items.length === 0) return null
                  // Build a name→quantity map from printData
                  const qtyMap = {}
                  const dataPairs = printData.skuPairs[category] || []
                  for (const pair of dataPairs) {
                    for (const item of pair) {
                      if (item && item.quantity) qtyMap[item.name] = item.quantity
                    }
                  }
                  const pairs = chunkPairs(items)
                  return [
                    /* Category header */
                    <tr key={`print-hdr-${category}`}>
                      <td colSpan={4} className="border border-black text-center py-1.5">
                        <span className="text-base font-bold">{category}</span>
                      </td>
                    </tr>,
                    /* Paired rows */
                    ...pairs.map((pair, idx) => {
                      const left = pair[0]
                      const right = pair[1]
                      return (
                        <tr key={`print-${category}-${idx}`}>
                          {/* Left name */}
                          <td className="border border-black px-2 py-1 text-center align-middle">
                            <span className="text-sm font-bold">{left.name}</span>
                            <br />
                            <span className="italic text-xs">{left.name_es}</span>
                          </td>
                          {/* Left count */}
                          <td className="border border-black px-2 py-1 text-center align-middle w-14 text-base font-bold">
                            {qtyMap[left.name] || ''}
                          </td>
                          {/* Right name or shaded */}
                          {right ? (
                            <td className="border border-black px-2 py-1 text-center align-middle">
                              <span className="text-sm font-bold">{right.name}</span>
                              <br />
                              <span className="italic text-xs">{right.name_es}</span>
                            </td>
                          ) : (
                            <td className="border border-black bg-gray-300" />
                          )}
                          {/* Right count or shaded */}
                          {right ? (
                            <td className="border border-black px-2 py-1 text-center align-middle w-14 text-base font-bold">
                              {qtyMap[right.name] || ''}
                            </td>
                          ) : (
                            <td className="border border-black bg-gray-300 w-14" />
                          )}
                        </tr>
                      )
                    })
                  ]
                })}

                {/* Weight row — 6 columns matching physical form */}
                <tr>
                  <td colSpan={4} className="p-0">
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr>
                          <td className="border border-black px-2 py-2 text-center align-middle">
                            <span className="text-sm font-bold">TOTAL<br />WEIGHT</span>
                          </td>
                          <td className="border border-black px-2 py-2 text-center align-middle" style={{ width: '14%' }}>
                            <span className="text-lg font-bold">{printData.totalWeight || ''}</span>
                          </td>
                          <td className="border border-black px-2 py-2 text-center align-middle">
                            <span className="text-sm font-bold">CART<br />WEIGHT</span>
                          </td>
                          <td className="border border-black px-2 py-2 text-center align-middle" style={{ width: '14%' }}>
                            <span className="text-lg font-bold">{printData.cartWeight || ''}</span>
                          </td>
                          <td className="border border-black px-2 py-2 text-center align-middle">
                            <span className="text-sm font-bold">LINEN<br />WEIGHT</span>
                          </td>
                          <td className="border border-black px-2 py-2 text-center align-middle" style={{ width: '14%' }}>
                            <span className="text-lg font-bold">{printData.linenWeight || ''}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
