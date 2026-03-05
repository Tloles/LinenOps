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

export const WASHER_ICON_SIZE = 125

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
