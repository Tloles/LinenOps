let cachedToken = null
let cachedOrgId = null
let tokenTimestamp = 0
const TOKEN_TTL = 30 * 60 * 1000 // 30 minutes

async function authenticate() {
  const loginBody = { email: process.env.SLING_EMAIL, password: process.env.SLING_PASSWORD }
  console.log('Sling login attempt for:', loginBody.email)

  const res = await fetch('https://api.getsling.com/account/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(loginBody),
  })

  const responseText = await res.text()
  console.log(`Sling login response (${res.status}):`, responseText)

  if (!res.ok) {
    throw new Error(`Sling login failed (${res.status}): ${responseText}`)
  }

  let body
  try {
    body = JSON.parse(responseText)
  } catch {
    throw new Error(`Sling login returned non-JSON: ${responseText}`)
  }

  const token = res.headers.get('authorization')
  const orgId = body.org?.id || body.user?.org?.id || body.orgs?.[0]?.id

  if (!token) throw new Error('No authorization token in Sling login response')
  if (!orgId) throw new Error('Could not extract orgId from Sling login response')

  cachedToken = token
  cachedOrgId = orgId
  tokenTimestamp = Date.now()

  return { token, orgId }
}

async function getAuth() {
  if (cachedToken && cachedOrgId && Date.now() - tokenTimestamp < TOKEN_TTL) {
    return { token: cachedToken, orgId: cachedOrgId }
  }
  return authenticate()
}

async function slingFetch(url, token, retried = false) {
  const res = await fetch(url, {
    headers: { Authorization: token },
  })

  if (res.status === 401 && !retried) {
    const { token: newToken } = await authenticate()
    return slingFetch(url, newToken, true)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sling API error (${res.status}): ${text}`)
  }

  return res.json()
}

export default async function handler(req, res) {
  try {
    const { action, from, to } = req.query

    if (!action) {
      return res.status(400).json({ error: 'Missing ?action= parameter' })
    }

    const { token, orgId } = await getAuth()
    const base = `https://api.getsling.com/${orgId}`

    let data
    if (action === 'users') {
      data = await slingFetch(`${base}/users`, token)
    } else if (action === 'timesheets') {
      if (!from || !to) {
        return res.status(400).json({ error: 'timesheets requires ?from=YYYY-MM-DD&to=YYYY-MM-DD' })
      }
      data = await slingFetch(`${base}/reports/timesheets?dates=${from}/${to}`, token)
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
