export const STATUS_COLORS = {
  clean_staged: 'bg-slate-100 text-slate-700',
  loaded: 'bg-amber-50 text-amber-800',
  delivered: 'bg-sky-50 text-sky-800',
  picked_up_soiled: 'bg-stone-100 text-stone-700',
  received_at_plant: 'bg-teal-50 text-teal-800',
  in_process: 'bg-indigo-50 text-indigo-800',
  lost: 'bg-rose-50 text-rose-700',
  retired: 'bg-gray-100 text-gray-500',
}

export function statusLabel(status) {
  return status.replace(/_/g, ' ')
}

// Suggested next status based on the bin lifecycle
export const NEXT_STATUS = {
  clean_staged: 'loaded',
  loaded: 'delivered',
  delivered: 'picked_up_soiled',
  picked_up_soiled: 'received_at_plant',
  received_at_plant: 'in_process',
  in_process: 'clean_staged',
}

// All statuses a scan can transition to (excluding lost/retired which are owner-only)
export const SCAN_STATUSES = [
  'clean_staged',
  'loaded',
  'delivered',
  'picked_up_soiled',
  'received_at_plant',
  'in_process',
]

export const CUSTOMER_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'limited_service', label: 'Limited Service' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'specialty', label: 'Specialty' },
]

export function isWellnessType(type) {
  return type === 'wellness'
}

export const BIN_COLORS = [
  { name: 'White',  hex: '#FFFFFF', border: '#D1D5DB' },
  { name: 'Gray',   hex: '#6B7280' },
  { name: 'Black',  hex: '#1F2937' },
  { name: 'Red',    hex: '#EF4444' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Green',  hex: '#22C55E' },
  { name: 'Blue',   hex: '#3B82F6' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Brown',  hex: '#92400E' },
]
