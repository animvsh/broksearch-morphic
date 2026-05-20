export default {
  async fetch(request) {
    const target = new URL(request.url)
    target.hostname = 'brok-production.up.railway.app'

    return fetch(new Request(target.toString(), request))
  }
}
