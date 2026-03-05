import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_COLORS, statusLabel, NEXT_STATUS, SCAN_STATUSES } from '../lib/constants'
import { dashLabel, groupByCustomer, groupBinsByCustomer } from '../lib/binUtils'
import CustomerLogo from '../components/CustomerLogo'
import CustomerGrid from '../components/CustomerGrid'

export default function ScanPage() {
  const { user, role } = useAuth()
  const [scanning, setScanning] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [bin, setBin] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [summaryBins, setSummaryBins] = useState([])
  const [trucks, setTrucks] = useState([])
  const [pendingStatus, setPendingStatus] = useState(null)
  const [selectedTruckId, setSelectedTruckId] = useState(null)
  const [binTruckMap, setBinTruckMap] = useState({})
  const scannerRef = useRef(null)
  const html5QrRef = useRef(null)

  const fetchSummaryBins = useCallback(async () => {
    const { data } = await supabase
      .from('bins')
      .select('id, current_status, customer_id, customers(id, name, logo_url)')
      .is('retired_at', null)
    if (data) setSummaryBins(data)
  }, [])

  const fetchTruckData = useCallback(async (binsData) => {
    // Fetch trucks
    const { data: truckRows } = await supabase
      .from('trucks')
      .select('id, name')
      .order('name')
    if (truckRows) setTrucks(truckRows)

    // Build bin→truck map from latest loaded scan events
    const onTruckIds = binsData
      .filter(b => b.current_status === 'loaded' || b.current_status === 'picked_up_soiled')
      .map(b => b.id)

    if (onTruckIds.length > 0) {
      const { data: scanEvents } = await supabase
        .from('scan_events')
        .select('bin_id, truck_id')
        .in('bin_id', onTruckIds)
        .eq('status', 'loaded')
        .not('truck_id', 'is', null)
        .order('scanned_at', { ascending: false })

      if (scanEvents) {
        const map = {}
        for (const ev of scanEvents) {
          if (!map[ev.bin_id]) map[ev.bin_id] = ev.truck_id
        }
        setBinTruckMap(map)
      }
    } else {
      setBinTruckMap({})
    }
  }, [])

  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from('bins')
        .select('id, current_status, customer_id, customers(id, name, logo_url)')
        .is('retired_at', null)
      if (data) {
        setSummaryBins(data)
        fetchTruckData(data)
      }
    }
    init()
  }, [fetchTruckData])

  const refreshAll = useCallback(async () => {
    const { data } = await supabase
      .from('bins')
      .select('id, current_status, customer_id, customers(id, name, logo_url)')
      .is('retired_at', null)
    if (data) {
      setSummaryBins(data)
      fetchTruckData(data)
    }
  }, [fetchTruckData])

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop()
      } catch {
        // scanner may already be stopped
      }
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
    setSuccess(null)
    setPendingStatus(null)

    const html5Qr = new Html5Qrcode('scanner-region')
    html5QrRef.current = html5Qr
    setScanning(true)

    try {
      await html5Qr.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 300, height: 150 },
          formatsToSupport: [0], // CODE_128
        },
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
    setLookingUp(true)
    setPendingStatus(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('bins')
        .select('*, customers(name, logo_url)')
        .eq('barcode', barcode.trim())
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!data) {
        setError(`No bin found with barcode "${barcode}".`)
        return
      }

      setBin(data)
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

  async function handleStatusTap(status) {
    if (status === 'loaded' || status === 'picked_up_soiled') {
      // Clear stale size before prompting
      if (bin) {
        console.log('[handleStatusTap] clearing size to null for bin:', bin.id)
        await supabase.from('bins').update({ size: null }).eq('id', bin.id)
      }
      setPendingStatus(status)
    } else {
      handleStatusUpdate(status)
    }
  }

  async function handleTruckSizeSelect(size) {
    if (!bin || !pendingStatus) return
    console.log('[handleTruckSizeSelect] driver selected size:', size, 'for bin:', bin.id, 'pendingStatus:', pendingStatus)
    const matchingTruck = trucks.find(t => t.name.includes(size))
    const truckId = matchingTruck ? matchingTruck.id : null
    await handleStatusUpdate(pendingStatus, truckId, size)
  }

  async function handleStatusUpdate(newStatus, truckId = null, binSize = null) {
    if (!bin) return
    setUpdating(true)
    setError(null)

    try {
      // Record the scan event (for truck_id tracking)
      const rpcParams = {
        p_bin_id: bin.id,
        p_status: newStatus,
        p_scanned_by: user.id,
      }
      if (truckId) rpcParams.p_truck_id = truckId

      const { error: rpcError } = await supabase.rpc('record_scan', rpcParams)

      if (rpcError) {
        // Fallback: direct insert if RPC doesn't exist
        if (rpcError.message.includes('record_scan') || rpcError.code === '42883') {
          const insertRow = { bin_id: bin.id, status: newStatus, scanned_by: user.id }
          if (truckId) insertRow.truck_id = truckId

          const { error: insertErr } = await supabase
            .from('scan_events')
            .insert(insertRow)
          if (insertErr) throw insertErr
        } else {
          throw rpcError
        }
      }

      // Single update call for bin — set size only for truck statuses, null for everything else
      const binUpdate = { current_status: newStatus }
      if (newStatus === 'loaded' || newStatus === 'picked_up_soiled') {
        binUpdate.size = binSize
      } else {
        binUpdate.size = null
      }

      console.log('[handleStatusUpdate] bin update payload:', JSON.stringify(binUpdate), 'bin.id:', bin.id)
      const { error: updateErr } = await supabase
        .from('bins')
        .update(binUpdate)
        .eq('id', bin.id)
      if (updateErr) throw updateErr

      // Re-fetch the actual bin record from the database
      const { data: freshBin } = await supabase
        .from('bins')
        .select('*, customers(name, logo_url)')
        .eq('id', bin.id)
        .single()
      console.log('[handleStatusUpdate] re-fetched bin:', JSON.stringify({ id: freshBin?.id, size: freshBin?.size, current_status: freshBin?.current_status }))

      setSuccess(`"${bin.barcode}" updated to ${statusLabel(newStatus)}`)
      setBin(null)
      setPendingStatus(null)
      setSelectedTruckId(null)
      refreshAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  function resetScan() {
    setBin(null)
    setSuccess(null)
    setError(null)
    setPendingStatus(null)
    setSelectedTruckId(null)
  }

  const suggestedStatus = bin ? NEXT_STATUS[bin.current_status] : null

  // Plant Status — always show all four
  const PLANT_STATUSES = ['received_at_plant', 'in_process', 'clean_staged', 'delivered']
  const plantStatus = PLANT_STATUSES.map((status) => {
    const customers = groupByCustomer(summaryBins, [status])
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { status, total, customers }
  })

  // On Truck — 4 fixed windows by bin.size + status
  const onTruckStatusBins = summaryBins.filter(b => b.current_status === 'loaded' || b.current_status === 'picked_up_soiled')
  const TRUCK_WINDOWS = [
    { label: "16' Clean",  status: 'loaded',           size: '16' },
    { label: "16' Soiled", status: 'picked_up_soiled', size: '16' },
    { label: "26' Clean",  status: 'loaded',           size: '26' },
    { label: "26' Soiled", status: 'picked_up_soiled', size: '26' },
  ]
  const truckWindows = TRUCK_WINDOWS.map(({ label, status, size }) => {
    const filtered = onTruckStatusBins.filter(b =>
      b.current_status === status && b.size === size
    )
    const customers = groupBinsByCustomer(filtered)
    const total = customers.reduce((s, c) => s + c.count, 0)
    return { label, total, customers }
  })

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Scan Bin</h2>

      {/* Success message */}
      {success && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 font-medium text-center text-lg">
          {success}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {/* Loading lookup */}
      {lookingUp && (
        <div className="text-center py-8 text-gray-500">Looking up bin...</div>
      )}

      {/* Scanner / Manual entry — shown when no bin is selected */}
      {!bin && !lookingUp && (
        <>
          {/* Camera scanner */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div
              id="scanner-region"
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
                <span className="text-xl font-semibold">Tap to Scan Barcode</span>
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
              Look Up
            </button>
          </form>
        </>
      )}

      {/* Bin found — show details + status update buttons */}
      {bin && (
        <div className="space-y-4">
          {/* Bin info card */}
          <div className="bg-white rounded-lg border-2 border-blue-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold font-mono text-gray-900">{bin.barcode}</span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize ${
                  STATUS_COLORS[bin.current_status] || 'bg-gray-100 text-gray-800'
                }`}
              >
                {statusLabel(bin.current_status)}
              </span>
            </div>
            {bin.description && (
              <p className="text-gray-600">{bin.description}</p>
            )}
            {bin.customers?.name && (
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                <CustomerLogo url={bin.customers.logo_url} name={bin.customers.name} size={40} />
              </div>
            )}
          </div>

          {/* Truck size selector — shown when pending loaded or picked_up_soiled */}
          {pendingStatus && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Which truck?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTruckSizeSelect('16')}
                  disabled={updating}
                  className="w-full min-h-[72px] text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700"
                >
                  {updating ? 'Updating...' : "16'"}
                </button>
                <button
                  onClick={() => handleTruckSizeSelect('26')}
                  disabled={updating}
                  className="w-full min-h-[72px] text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700"
                >
                  {updating ? 'Updating...' : "26'"}
                </button>
              </div>
              <button
                onClick={() => setPendingStatus(null)}
                className="w-full min-h-[48px] text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Status update buttons — hidden when truck selector is showing */}
          {!pendingStatus && bin.current_status !== 'lost' && bin.current_status !== 'retired' ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Update status to:</p>

              {/* Suggested next status — large primary button */}
              {suggestedStatus && (
                <button
                  onClick={() => handleStatusTap(suggestedStatus)}
                  disabled={updating}
                  className="w-full min-h-[72px] text-xl font-bold rounded-xl capitalize disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                >
                  {updating ? 'Updating...' : statusLabel(suggestedStatus)}
                </button>
              )}

              {/* Other statuses */}
              <div className="grid grid-cols-2 gap-2">
                {SCAN_STATUSES.filter(
                  (s) => s !== suggestedStatus && s !== bin.current_status
                ).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusTap(status)}
                    disabled={updating}
                    className="min-h-[56px] px-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </div>
            </div>
          ) : !pendingStatus && (bin.current_status === 'lost' || bin.current_status === 'retired') ? (
            <div className="p-4 rounded-lg bg-gray-50 text-gray-600 text-center">
              This bin is {statusLabel(bin.current_status)} and cannot be scanned.
            </div>
          ) : null}

          {/* Scan another */}
          {!pendingStatus && (
            <button
              onClick={resetScan}
              className="w-full min-h-[48px] text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Scan Another Bin
            </button>
          )}
        </div>
      )}

      {/* Plant Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">Plant Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {plantStatus.map(({ status, total, customers }) => (
            <div key={status} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <p className="text-4xl font-bold text-[#1B2541]">{total} <span className="text-slate-500">{dashLabel(status)}</span></p>
              <CustomerGrid customers={customers} />
            </div>
          ))}
        </div>
      </div>

      {/* On Truck */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-xl font-bold text-[#1B2541] uppercase tracking-wider mb-2">On Truck</h3>
        <div className="grid grid-cols-2 gap-3">
          {truckWindows.map(({ label, total, customers }) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <p className="text-4xl font-bold text-[#1B2541]">{total} <span className="text-slate-500">{label}</span></p>
              <CustomerGrid customers={customers} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
