import { statusLabel } from './constants'

const DASHBOARD_LABELS = {
  received_at_plant: 'Soiled Bins',
}

export function dashLabel(status) {
  return DASHBOARD_LABELS[status] || statusLabel(status)
}

export function groupByCustomer(bins, statuses) {
  const map = {}
  for (const bin of bins) {
    if (!statuses.includes(bin.current_status)) continue
    const cust = bin.customers
    if (!cust) continue
    if (!map[cust.id]) map[cust.id] = { ...cust, count: 0 }
    map[cust.id].count++
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

const WASHER_ICON_SIZES = { 1: 150, 2: 150, 3: 75, 4: 100, 5: 125, 6: 150 }

export function washerIconSize(name) {
  const num = parseInt(String(name).replace(/\D/g, ''), 10)
  return WASHER_ICON_SIZES[num] || 100
}

export function groupBinsByCustomer(bins) {
  const map = {}
  for (const bin of bins) {
    const cust = bin.customers
    if (!cust) continue
    if (!map[cust.id]) map[cust.id] = { ...cust, count: 0 }
    map[cust.id].count++
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}
