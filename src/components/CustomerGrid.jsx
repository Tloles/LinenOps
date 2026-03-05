import CustomerLogo from './CustomerLogo'

export default function CustomerGrid({ customers }) {
  if (customers.length === 0) {
    return <div className="text-sm text-gray-400 mt-1">None</div>
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
      {customers.map((cust) => (
        <div key={cust.id} className="flex flex-col items-center">
          <CustomerLogo url={cust.logo_url} name={cust.name} size={200} />
          <div className="text-2xl font-bold text-[#1B2541] -mt-1">{cust.count}</div>
        </div>
      ))}
    </div>
  )
}
