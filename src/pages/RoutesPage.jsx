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
import { DAYS_OF_WEEK } from '../lib/routes'
import SortableStop from '../components/SortableStop'

export default function RoutesPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [routes, setRoutes] = useState([])
  const [customers, setCustomers] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
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
    const { data, error } = await supabase
      .from('routes')
      .select('*, route_stops(*, customers(id, name, logo_url), locations(id, name, weekly_par, deliveries_per_week, customers(id, name, logo_url)))')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching routes:', error)
    } else {
      const sorted = (data || []).map((r) => ({
        ...r,
        route_stops: (r.route_stops || []).sort((a, b) => a.stop_order - b.stop_order),
      }))
      setRoutes(sorted)
    }
    setLoading(false)
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name, logo_url')
      .order('name')
    setCustomers(data || [])
  }

  async function fetchLocations() {
    const { data } = await supabase
      .from('locations')
      .select('id, name, customer_id, customers(name, logo_url)')
      .order('name')
    setLocations(data || [])
  }

  async function createRoute(e) {
    e.preventDefault()
    if (!newRouteName.trim()) return

    const { error } = await supabase
      .from('routes')
      .insert({ name: newRouteName.trim(), schedule: [] })

    if (error) {
      console.error('Error creating route:', error)
      return
    }
    setNewRouteName('')
    fetchRoutes()
  }

  async function toggleDay(route, day) {
    const schedule = route.schedule || []
    const newSchedule = schedule.includes(day)
      ? schedule.filter((d) => d !== day)
      : [...schedule, day].sort()

    const { error } = await supabase
      .from('routes')
      .update({ schedule: newSchedule })
      .eq('id', route.id)

    if (error) {
      console.error('Error updating schedule:', error)
      return
    }
    setRoutes((prev) =>
      prev.map((r) => (r.id === route.id ? { ...r, schedule: newSchedule } : r))
    )
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
      console.error('Error adding stop:', error)
      return
    }
    setAddStopValue((prev) => ({ ...prev, [routeId]: '' }))
    fetchRoutes()
  }

  async function deleteStop(stopId) {
    const { error } = await supabase.from('route_stops').delete().eq('id', stopId)
    if (error) {
      console.error('Error deleting stop:', error)
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
      console.error('Error deleting route:', error)
      return
    }
    fetchRoutes()
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading routes...</div>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Route Management</h2>

      {/* Create route */}
      <form onSubmit={createRoute} className="flex gap-2">
        <input
          type="text"
          value={newRouteName}
          onChange={(e) => setNewRouteName(e.target.value)}
          placeholder="New route name..."
          className="flex-1 py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="submit"
          className="min-h-[48px] px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
        >
          Create
        </button>
      </form>

      {routes.length === 0 && (
        <p className="text-gray-500 text-center py-4">No routes yet. Create one above.</p>
      )}

      {routes.map((route) => {
        const isExpanded = expanded === route.id

        // Build sets of already-used customer_ids and location_ids
        const usedCustomerIds = new Set(
          route.route_stops.filter((s) => s.customer_id).map((s) => s.customer_id)
        )
        const usedLocationIds = new Set(
          route.route_stops.filter((s) => s.location_id).map((s) => s.location_id)
        )
        const availableCustomers = customers.filter((c) => !usedCustomerIds.has(c.id))
        const availableLocations = locations.filter((l) => !usedLocationIds.has(l.id))
        const hasAvailable = availableCustomers.length > 0 || availableLocations.length > 0

        return (
          <div
            key={route.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            {/* Route header */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
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

              {/* Day toggles */}
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((day) => {
                  const active = (route.schedule || []).includes(day.value)
                  return (
                    <button
                      key={day.value}
                      onClick={() => toggleDay(route, day.value)}
                      className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title={day.label}
                    >
                      {day.short}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Expanded: stops list */}
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
                {hasAvailable && (
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
                      {availableCustomers.length > 0 && (
                        <optgroup label="Customers">
                          {availableCustomers.map((c) => (
                            <option key={c.id} value={`c:${c.id}`}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {availableLocations.length > 0 && (
                        <optgroup label="Wellness Locations">
                          {availableLocations.map((l) => (
                            <option key={l.id} value={`l:${l.id}`}>
                              {l.customers?.name} — {l.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button
                      onClick={() => addStop(route.id)}
                      disabled={!addStopValue[route.id]}
                      className="min-h-[40px] px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
