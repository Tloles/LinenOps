import { statusLabel } from './constants'

const DASHBOARD_LABELS = {
  received_at_plant: 'Soiled',
  in_process: 'In Process',
  clean_staged: 'Completed',
  delivered: 'Delivered',
  loaded: 'Loaded',
  picked_up_soiled: 'Picked Up Soiled',
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

export function groupByCustomerWithSize(bins, statuses) {
  const map = {}
  for (const bin of bins) {
    if (!statuses.includes(bin.current_status)) continue
    const cust = bin.customers
    if (!cust) continue
    if (!map[cust.id]) map[cust.id] = { ...cust, count: 0, size16: 0, size26: 0 }
    map[cust.id].count++
    if (bin.size === '16') map[cust.id].size16++
    else if (bin.size === '26') map[cust.id].size26++
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
