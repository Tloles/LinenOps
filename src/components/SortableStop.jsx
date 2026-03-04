import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CustomerLogo from './CustomerLogo'

export default function SortableStop({ stop, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isLocation = !!stop.location_id
  const name = isLocation ? stop.locations?.name : stop.customers?.name
  const logoUrl = isLocation ? stop.locations?.customers?.logo_url : stop.customers?.logo_url
  const logoName = isLocation ? stop.locations?.customers?.name : stop.customers?.name
  const subtitle = isLocation ? stop.locations?.customers?.name : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
        aria-label="Drag to reorder"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </button>
      <CustomerLogo url={logoUrl} name={logoName} size={40} />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900 truncate block">{name}</span>
        {subtitle && (
          <span className="text-xs text-gray-500 truncate block">{subtitle}</span>
        )}
      </div>
      {isLocation && (
        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">Wellness</span>
      )}
      <button
        onClick={() => onDelete(stop.id)}
        className="min-h-[36px] min-w-[36px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
        aria-label="Remove stop"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
