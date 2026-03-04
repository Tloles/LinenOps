import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CUSTOMER_TYPES } from '../lib/constants'
import { DAYS_OF_WEEK, getTodayDayOfWeek } from '../lib/routes'
import SortableStop from '../components/SortableStop'

function customerTypeLabel(type) {
  const found = CUSTOMER_TYPES.find((t) => t.value === type)
  return found ? found.label : type || 'Customer'
}

export default function RoutesPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [routes, setRoutes] = useState([])
  const [customers, setCustomers] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(getTodayDayOfWeek())
  const [expanded, setExpanded] = useState(null)
  const [newRouteName, setNewRouteName] = useState('')
  const [addStopValue, setAddStopValue] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  useEffect(() => {
    if (role && role !== 'owner') {
      navigate('/routes/today', { replace: true })
      return
    }
    fetchRoutes()
    fetchCustomers()
    fetchLocations()
  }, [role])

  async function fetchRoutes() {
    setLoading(true)

    let { data, error } = await supabase
      .from('routes')
      .select('*, route_stops(*, customers(id, name, logo_url), locations(id, name, weekly_par, deliveries_per_week, customers(id, name, logo_url)))')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[RoutesPage] Full query failed, falling back without locations:', error.message)
      const fallback = await supabase
        .from('routes')
        .select('*, route_stops(*, customers(id, name, logo_url))')
        .order('created_at', { ascending: true })
      data = fallback.data
      error = fallback.error
    }

    if (error) {
      console.error('[RoutesPage] fetchRoutes error:', error)
    }

    const sorted = (data || []).map((r) => ({
      ...r,
      route_stops: (r.route_stops || []).sort((a, b) => a.stop_order - b.stop_order),
    }))
    console.log('[RoutesPage] fetched', sorted.length, 'routes')
    setRoutes(sorted)
    setLoading(false)
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name, type, logo_url')
      .order('name')
    setCustomers(data || [])
  }

  async function fetchLocations() {
    const { data, error } = await supabase
      .from('locations')
      .select('id, name, customer_id, customers(name, logo_url)')
      .order('name')
    if (error) {
      console.warn('[RoutesPage] fetchLocations error (table may not exist yet):', error.message)
    }
    setLocations(data || [])
  }

  async function createRoute(e) {
    e.preventDefault()
    if (!newRouteName.trim()) return

    const { data, error } = await supabase
      .from('routes')
      .insert({ name: newRouteName.trim(), day_of_week: selectedDay })
      .select()

    console.log('[RoutesPage] createRoute result:', { data, error })
    if (error) {
      console.error('[RoutesPage] createRoute error:', error)
      return
    }
    setNewRouteName('')
    fetchRoutes()
  }

  async function addStop(routeId) {
    const value = addStopValue[routeId]
    if (!value) return

    const [type, id] = value.split(':')
    const route = routes.find((r) => r.id === routeId)
    const maxOrder = route.route_stops.reduce(
      (max, s) => Math.max(max, s.stop_order || 0),
      0
    )

    const row = {
      route_id: routeId,
      stop_order: maxOrder + 1,
    }

    if (type === 'c') {
      row.customer_id = id
    } else {
      row.location_id = id
    }

    const { error } = await supabase.from('route_stops').insert(row)

    if (error) {
      console.error('[RoutesPage] addStop error:', error)
      return
    }
    setAddStopValue((prev) => ({ ...prev, [routeId]: '' }))
    fetchRoutes()
  }

  async function deleteStop(stopId) {
    const { error } = await supabase.from('route_stops').delete().eq('id', stopId)
    if (error) {
      console.error('[RoutesPage] deleteStop error:', error)
      return
    }
    fetchRoutes()
  }

  async function handleDragEnd(event, routeId) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const route = routes.find((r) => r.id === routeId)
    const stops = route.route_stops
    const oldIndex = stops.findIndex((s) => s.id === active.id)
    const newIndex = stops.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stops, oldIndex, newIndex)

    setRoutes((prev) =>
      prev.map((r) =>
        r.id === routeId ? { ...r, route_stops: reordered } : r
      )
    )

    const updates = reordered.map((stop, i) =>
      supabase
        .from('route_stops')
        .update({ stop_order: i + 1 })
        .eq('id', stop.id)
    )
    await Promise.all(updates)
  }

  async function deleteRoute(routeId) {
    const { error } = await supabase.from('routes').delete().eq('id', routeId)
    if (error) {
      console.error('[RoutesPage] deleteRoute error:', error)
      return
    }
    fetchRoutes()
  }

  // Routes for the selected day
  const dayRoutes = routes.filter((r) => r.day_of_week === selectedDay)

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading routes...</div>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Route Management</h2>

      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS_OF_WEEK.map((day) => {
          const isSelected = selectedDay === day.value
          const isToday = day.value === getTodayDayOfWeek()
          const count = routes.filter((r) => r.day_of_week === day.value).length
          return (
            <button
              key={day.value}
              onClick={() => { setSelectedDay(day.value); setExpanded(null) }}
              className={`min-h-[44px] px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {day.short}
              {isToday && !isSelected && (
                <span className="ml-1 w-1.5 h-1.5 bg-blue-500 rounded-full inline-block align-middle" />
              )}
              {count > 0 && (
                <span className={`ml-1 text-xs ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                  ({count})
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Routes for selected day */}
      {dayRoutes.map((route) => {
        const isExpanded = expanded === route.id

        const usedCustomerIds = new Set(
          route.route_stops.filter((s) => s.customer_id).map((s) => s.customer_id)
        )
        const usedLocationIds = new Set(
          route.route_stops.filter((s) => s.location_id).map((s) => s.location_id)
        )
        const availableCustomers = customers.filter((c) => !usedCustomerIds.has(c.id))
        const availableLocations = locations.filter((l) => !usedLocationIds.has(l.id))

        return (
          <div
            key={route.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            {/* Route header */}
            <div className="p-4 flex items-center justify-between">
              <button
                onClick={() => setExpanded(isExpanded ? null : route.id)}
                className="flex items-center gap-2 text-left"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <h3 className="text-base font-semibold text-gray-900">{route.name}</h3>
                <span className="text-sm text-gray-400">
                  ({route.route_stops.length} stop{route.route_stops.length !== 1 ? 's' : ''})
                </span>
              </button>
              <button
                onClick={() => deleteRoute(route.id)}
                className="text-sm text-gray-400 hover:text-red-600 px-2 py-1"
              >
                Delete
              </button>
            </div>

            {/* Expanded: stops + add stop */}
            {isExpanded && (
              <div className="border-t border-gray-200 p-4 space-y-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(e, route.id)}
                >
                  <SortableContext
                    items={route.route_stops.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {route.route_stops.map((stop) => (
                      <SortableStop
                        key={stop.id}
                        stop={stop}
                        onDelete={deleteStop}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {route.route_stops.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-2">No stops yet</p>
                )}

                {/* Add stop */}
                <div className="flex gap-2 pt-2">
                  <select
                    value={addStopValue[route.id] || ''}
                    onChange={(e) =>
                      setAddStopValue((prev) => ({
                        ...prev,
                        [route.id]: e.target.value,
                      }))
                    }
                    className="flex-1 py-2 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Add a stop...</option>
                    {availableCustomers.map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {customerTypeLabel(c.type)}: {c.name}
                      </option>
                    ))}
                    {availableLocations.map((l) => (
                      <option key={l.id} value={`l:${l.id}`}>
                        Wellness: {l.customers?.name} {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => addStop(route.id)}
                    disabled={!addStopValue[route.id]}
                    className="min-h-[40px] px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {dayRoutes.length === 0 && (
        <p className="text-gray-500 text-center py-4">
          No routes for {DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label}.
        </p>
      )}

      {/* Add route for this day */}
      <form onSubmit={createRoute} className="flex gap-2">
        <input
          type="text"
          value={newRouteName}
          onChange={(e) => setNewRouteName(e.target.value)}
          placeholder={`New route for ${DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label}...`}
          className="flex-1 py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="submit"
          className="min-h-[48px] px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
        >
          Add Route
        </button>
      </form>
    </div>
  )
}
