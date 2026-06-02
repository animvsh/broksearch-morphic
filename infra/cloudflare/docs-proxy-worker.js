const worker = {
  async fetch(request) {
    const target = new URL(request.url)
    const upstreamHost = (
      process.env.BROK_UPSTREAM_ORIGIN ||
      'https://brok-production.up.railway.app'
    ).trim()
    let hostname = 'brok-production.up.railway.app'

    try {
      hostname = new URL(upstreamHost).hostname
    } catch {
      hostname = 'brok-production.up.railway.app'
    }

    target.hostname = hostname

    return fetch(new Request(target.toString(), request))
  }
}

export default worker
