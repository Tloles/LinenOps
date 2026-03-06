export default function CustomerLogo({ url, name, size = 40, className }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name || 'Customer'}
        className={className || 'rounded-md object-contain shrink-0'}
        style={className ? undefined : { width: size, height: size }}
      />
    )
  }
  return <span className="font-medium text-gray-700 truncate">{name}</span>
}
