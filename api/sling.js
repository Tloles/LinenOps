const TOKEN = process.env.SLING_TOKEN
const ORG_ID = process.env.SLING_ORG_ID

async function slingFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: TOKEN },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sling API error (${res.status}): ${text}`)
  }

  return res.json()
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
    if (action === 'users') {
      data = await slingFetch(`${base}/users`)
    } else if (action === 'timesheets') {
      if (!from || !to) {
        return res.status(400).json({ error: 'timesheets requires ?from=YYYY-MM-DD&to=YYYY-MM-DD' })
      }
      data = await slingFetch(`${base}/reports/timesheets?dates=${from}/${to}`)
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
