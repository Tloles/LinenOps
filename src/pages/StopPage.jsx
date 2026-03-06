import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { statusLabel, NEXT_STATUS } from '../lib/constants'
import CustomerLogo from '../components/CustomerLogo'

export default function StopPage() {
  const { routeId, stopId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [stop, setStop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [message, setMessage] = useState(null)

  // Hotel stop state
  const [scanning, setScanning] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [tally, setTally] = useState({ delivered: 0, picked_up: 0 })
  const [torchOn, setTorchOn] = useState(false)
  const html5QrRef = useRef(null)
  const scannerRef = useRef(null)

  // Wellness stop state
  const [shelfCount, setShelfCount] = useState('')
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false)

  useEffect(() => {
    fetchStopData()
    return () => {
      if (html5QrRef.current) {
        html5QrRef.current.stop()
      }
    }
  }, [stopId])

  async function fetchStopData() {
    setLoading(true)

    // Try full query with locations join first
    let { data: stopData, error: stopErr } = await supabase
      .from('route_stops')
      .select('*, customers(id, name, address, logo_url), locations(id, name, weekly_par, deliveries_per_week, customer_id, customers(id, name, address, logo_url))')
      .eq('id', stopId)
      .single()

    // Fallback: if locations join fails (column not yet migrated), fetch without it
    if (stopErr) {
      console.warn('[StopPage] Full query failed, falling back without locations:', stopErr.message)
      const fallback = await supabase
        .from('route_stops')
        .select('*, customers(id, name, address, logo_url)')
        .eq('id', stopId)
        .single()
      stopData = fallback.data
      stopErr = fallback.error
    }

    if (stopErr || !stopData) {
      console.error('[StopPage] fetchStopData error:', stopErr)
      setLoading(false)
      return
    }

    console.log('[StopPage] loaded stop:', stopData.id, stopData.location_id ? 'wellness' : 'hotel')
    setStop(stopData)
    setLoading(false)
  }

  const isLocation = stop ? !!stop.location_id : false
  const customer = isLocation ? stop?.locations?.customers : stop?.customers
  const location = stop?.locations

  // Wellness par calculation
  const deliveryPar = location
    ? Math.ceil(location.weekly_par / location.deliveries_per_week)
    : 0
  const shelfNum = parseInt(shelfCount, 10)
  const deliveryAmount = !isNaN(shelfNum) ? Math.max(0, deliveryPar - shelfNum) : null

  // ── Hotel stop: scanner logic ──

  const stopScanner = useCallback(() => {
    if (html5QrRef.current) {
      html5QrRef.current.stop()
      html5QrRef.current = null
    }
    setTorchOn(false)
    setScanning(false)
  }, [])

  async function startScanner() {
    setMessage(null)
    setTorchOn(false)
    setScanning(true)

    try {
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader(hints)
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
        scannerRef.current,
        (result) => {
          if (result) {
            controls?.stop()
            html5QrRef.current = null
            setTorchOn(false)
            setScanning(false)
            handleScan(result.getText())
          }
        }
      )
      html5QrRef.current = controls
    } catch {
      setMessage({ type: 'error', text: 'Could not start camera. Use manual entry.' })
      setScanning(false)
    }
  }

  async function toggleTorch() {
    try {
      const video = scannerRef.current
      if (!video?.srcObject) return
      const track = video.srcObject.getVideoTracks()[0]
      if (!track) return
      const newState = !torchOn
      await track.applyConstraints({ advanced: [{ torch: newState }] })
      setTorchOn(newState)
    } catch {
      // torch not supported on this device
    }
  }

  async function handleScan(barcode) {
    setMessage(null)
    const trimmed = barcode.trim()

    const { data: bin, error } = await supabase
      .from('bins')
      .select('id, barcode, current_status, customer_id')
      .eq('barcode', trimmed)
      .is('retired_at', null)
      .maybeSingle()

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    if (!bin) {
      setMessage({ type: 'error', text: `No active bin found: "${trimmed}"` })
      return
    }

    if (bin.customer_id !== stop.customer_id) {
      setMessage({ type: 'error', text: `Bin "${trimmed}" belongs to a different customer.` })
      return
    }

    const newStatus = NEXT_STATUS[bin.current_status]
    if (!newStatus) {
      setMessage({ type: 'error', text: `Bin "${trimmed}" status "${statusLabel(bin.current_status)}" has no next step.` })
      return
    }

    const { error: rpcError } = await supabase.rpc('record_scan', {
      p_bin_id: bin.id,
      p_status: newStatus,
    })

    if (rpcError) {
      if (rpcError.message.includes('record_scan') || rpcError.code === '42883') {
        const { error: insertErr } = await supabase
          .from('scan_events')
          .insert({ bin_id: bin.id, status: newStatus, scanned_by: user.id })
        if (insertErr) {
          setMessage({ type: 'error', text: insertErr.message })
          return
        }
        const { error: updateErr } = await supabase
          .from('bins')
          .update({ current_status: newStatus })
          .eq('id', bin.id)
        if (updateErr) {
          setMessage({ type: 'error', text: updateErr.message })
          return
        }
      } else {
        setMessage({ type: 'error', text: rpcError.message })
        return
      }
    }

    if (newStatus === 'delivered') {
      setTally((prev) => ({ ...prev, delivered: prev.delivered + 1 }))
    } else if (newStatus === 'picked_up_soiled') {
      setTally((prev) => ({ ...prev, picked_up: prev.picked_up + 1 }))
    }

    setMessage({
      type: 'success',
      text: `${trimmed}: ${statusLabel(bin.current_status)} → ${statusLabel(newStatus)}`,
    })
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualBarcode.trim()) return
    stopScanner()
    handleScan(manualBarcode.trim())
    setManualBarcode('')
  }

  // ── Wellness stop: confirm delivery ──

  async function confirmDelivery() {
    if (deliveryAmount === null) return

    const { error } = await supabase.from('delivery_logs').insert({
      location_id: stop.location_id,
      date: new Date().toISOString().split('T')[0],
      delivered_by: user.id,
      shelf_count: shelfNum,
      delivery_amount: deliveryAmount,
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setDeliveryConfirmed(true)
    setMessage({
      type: 'success',
      text: `Delivery logged: ${deliveryAmount} items to ${location.name}`,
    })
  }

  // ── Complete stop (shared) ──

  async function completeStop() {
    setCompleting(true)
    const { error } = await supabase.from('route_progress').insert({
      route_id: routeId,
      stop_id: stopId,
      completed_by: user.id,
      date: new Date().toISOString().split('T')[0],
    })

    if (error) {
      if (error.code === '23505') {
        navigate(`/routes/today/${routeId}`)
        return
      }
      console.error('Error completing stop:', error)
      setMessage({ type: 'error', text: 'Failed to complete stop.' })
      setCompleting(false)
      return
    }

    navigate(`/routes/today/${routeId}`)
  }

  // ── Render ──

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading stop...</div>
  }

  if (!stop) {
    return <div className="text-center py-8 text-red-500">Stop not found.</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/routes/today/${routeId}`)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <CustomerLogo url={customer?.logo_url} name={customer?.name} size={56} />
          <div className="min-w-0">
            {isLocation && (
              <p className="text-xs text-purple-600 font-medium">{customer?.name}</p>
            )}
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {isLocation ? location.name : customer?.name}
            </h2>
            {customer?.address && (
              <p className="text-sm text-gray-500 truncate">{customer.address}</p>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg font-medium text-center ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Hotel stop: bin scanning ── */}
      {!isLocation && (
        <>
          {/* Session tally */}
          <div className="flex gap-3">
            <div className="flex-1 bg-sky-50 border border-sky-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-sky-700">{tally.delivered}</p>
              <p className="text-xs font-medium text-sky-600">Delivered</p>
            </div>
            <div className="flex-1 bg-stone-50 border border-stone-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-stone-700">{tally.picked_up}</p>
              <p className="text-xs font-medium text-stone-600">Picked Up</p>
            </div>
          </div>

          {/* Scanner */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <video
              ref={scannerRef}
              className={scanning ? 'w-full' : 'hidden'}
            />
            {!scanning && (
              <button
                onClick={startScanner}
                className="w-full min-h-[120px] flex flex-col items-center justify-center gap-2 text-blue-600 hover:bg-blue-50 active:bg-blue-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10M12 7v10" />
                </svg>
                <span className="text-lg font-semibold">Tap to Scan Cart</span>
              </button>
            )}
            {scanning && (
              <div className="flex">
                <button
                  onClick={stopScanner}
                  className="flex-1 min-h-[48px] bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                >
                  Stop Scanner
                </button>
                <button
                  onClick={toggleTorch}
                  className={`min-h-[48px] px-4 font-medium transition-colors ${
                    torchOn ? 'bg-yellow-400 text-gray-900' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                  title={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Manual entry */}
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
              Scan
            </button>
          </form>
        </>
      )}

      {/* ── Wellness stop: par-based delivery ── */}
      {isLocation && (
        <div className="space-y-4">
          {/* Par info */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Weekly Par</span>
              <span className="text-lg font-bold text-gray-900">{location.weekly_par}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Deliveries / Week</span>
              <span className="text-lg font-bold text-gray-900">{location.deliveries_per_week}</span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Delivery Par</span>
              <span className="text-xl font-bold text-blue-700">{deliveryPar}</span>
            </div>
          </div>

          {/* Shelf count input */}
          {!deliveryConfirmed && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <label htmlFor="shelf-count" className="block text-sm font-medium text-gray-700">
                Current Shelf Count
              </label>
              <input
                id="shelf-count"
                type="number"
                inputMode="numeric"
                min="0"
                value={shelfCount}
                onChange={(e) => setShelfCount(e.target.value)}
                placeholder="How many on shelf?"
                className="w-full py-3 px-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />

              {deliveryAmount !== null && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-600 font-medium">Deliver</p>
                  <p className="text-4xl font-bold text-blue-700">{deliveryAmount}</p>
                  <p className="text-xs text-blue-500 mt-1">
                    Par {deliveryPar} − Shelf {shelfNum} = {deliveryAmount}
                  </p>
                </div>
              )}

              <button
                onClick={confirmDelivery}
                disabled={deliveryAmount === null}
                className="w-full min-h-[56px] text-lg font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deliveryAmount !== null
                  ? `Confirm Delivery (${deliveryAmount})`
                  : 'Enter shelf count'}
              </button>
            </div>
          )}

          {/* Delivery confirmed summary */}
          {deliveryConfirmed && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-600 font-medium">Delivery Confirmed</p>
              <p className="text-3xl font-bold text-green-700">{deliveryAmount} items</p>
              <p className="text-xs text-green-500 mt-1">Shelf: {shelfNum} | Par: {deliveryPar}</p>
            </div>
          )}
        </div>
      )}

      {/* Complete stop */}
      <button
        onClick={completeStop}
        disabled={completing}
        className="w-full min-h-[56px] text-lg font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {completing ? 'Completing...' : 'Complete Stop'}
      </button>
    </div>
  )
}
