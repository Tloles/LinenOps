import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_COLORS, statusLabel, NEXT_STATUS, SCAN_STATUSES } from '../lib/constants'
import CustomerLogo from '../components/CustomerLogo'

export default function ScanPage() {
  const { user } = useAuth()
  const [scanning, setScanning] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [bin, setBin] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [updating, setUpdating] = useState(false)
  const scannerRef = useRef(null)
  const html5QrRef = useRef(null)

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

  async function handleStatusUpdate(newStatus) {
    if (!bin) return
    setUpdating(true)
    setError(null)

    try {
      // Try the record_scan RPC first
      const { error: rpcError } = await supabase.rpc('record_scan', {
        p_bin_id: bin.id,
        p_status: newStatus,
        p_scanned_by: user.id,
      })

      if (rpcError) {
        // Fallback: direct insert + update if RPC doesn't exist
        if (rpcError.message.includes('record_scan') || rpcError.code === '42883') {
          const { error: insertErr } = await supabase
            .from('scan_events')
            .insert({ bin_id: bin.id, status: newStatus, scanned_by: user.id })
          if (insertErr) throw insertErr

          const { error: updateErr } = await supabase
            .from('bins')
            .update({ current_status: newStatus })
            .eq('id', bin.id)
          if (updateErr) throw updateErr
        } else {
          throw rpcError
        }
      }

      setSuccess(`"${bin.barcode}" updated to ${statusLabel(newStatus)}`)
      setBin(null)
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
  }

  const suggestedStatus = bin ? NEXT_STATUS[bin.current_status] : null

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

          {/* Status update buttons */}
          {bin.current_status !== 'lost' && bin.current_status !== 'retired' ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Update status to:</p>

              {/* Suggested next status — large primary button */}
              {suggestedStatus && (
                <button
                  onClick={() => handleStatusUpdate(suggestedStatus)}
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
                    onClick={() => handleStatusUpdate(status)}
                    disabled={updating}
                    className="min-h-[56px] px-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-gray-50 text-gray-600 text-center">
              This bin is {statusLabel(bin.current_status)} and cannot be scanned.
            </div>
          )}

          {/* Scan another */}
          <button
            onClick={resetScan}
            className="w-full min-h-[48px] text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Scan Another Bin
          </button>
        </div>
      )}
    </div>
  )
}
