export default function CustomerLogo({ url, name, size = 40 }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name || 'Customer'}
        className="rounded-md object-contain shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return <span className="font-medium text-gray-700 truncate">{name}</span>
}
