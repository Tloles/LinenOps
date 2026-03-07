const TOKEN = process.env.SLING_TOKEN
const ORG_ID = process.env.SLING_ORG_ID

async function slingFetch(url) {
  console.log('Sling fetch:', url)
  const res = await fetch(url, {
    headers: { Authorization: TOKEN },
  })

  const text = await res.text()
  console.log(`Sling response (${res.status}) from ${url}:`, text.slice(0, 500))

  if (!res.ok) {
    throw new Error(`Sling API error (${res.status}): ${text}`)
  }

  return JSON.parse(text)
}

// Add one day to a YYYY-MM-DD string (Sling report intervals are exclusive end)
function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  try {
    if (!TOKEN) return res.status(500).json({ error: 'SLING_TOKEN not configured' })
    if (!ORG_ID) return res.status(500).json({ error: 'SLING_ORG_ID not configured' })

    const { action, from, to } = req.query

    if (!action) {
      return res.status(400).json({ error: 'Missing ?action= parameter' })
    }

    const base = `https://api.getsling.com/v1/${ORG_ID}`

    let data
    if (action === 'concise') {
      data = await slingFetch(`${base}/users/concise`)
    } else if (action === 'groups') {
      data = await slingFetch(`${base}/groups`)
    } else if (action === 'timesheets') {
      if (!from || !to) {
        return res.status(400).json({ error: 'timesheets requires ?from=YYYY-MM-DD&to=YYYY-MM-DD' })
      }
      // GET /v1/reports/timesheets — actual clock-in/out data
      // Sling uses ISO8601 interval with exclusive end date
      data = await slingFetch(`${base}/reports/timesheets?dates=${from}/${nextDay(to)}`)
    } else if (action === 'payroll') {
      if (!from || !to) {
        return res.status(400).json({ error: 'payroll requires ?from=YYYY-MM-DD&to=YYYY-MM-DD' })
      }
      // GET /v1/reports/payroll — wage/hours totals per employee
      data = await slingFetch(`${base}/reports/payroll?dates=${from}/${nextDay(to)}`)
    } else if (action === 'currentclockin') {
      // GET /v1/timeclock/clockin — who is currently clocked in
      data = await slingFetch(`${base}/timeclock/clockin`)
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)
  } catch (err) {
    console.error('Sling proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
