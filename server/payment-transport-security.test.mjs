import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'

// Resolve the transport through the official SDK, not a test-only HTTP mock.
const { request } = createRequire(import.meta.resolve('alipay-sdk'))('urllib')
async function listen(handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
const close = server => new Promise(resolve => server.close(resolve))

test('Alipay transport strips standard credential headers on cross-origin redirects', async () => {
  let received
  const destination = await listen((req, res) => { received = req.headers; res.end('ok') })
  const source = await listen((req, res) => { res.writeHead(302, { Location: `${destination.url}/target` }); res.end() })
  const headers = { Authorization: 'Bearer fixture-only', Cookie: 'fixture=not-a-user-session', 'Proxy-Authorization': 'Basic fixture-only' }
  try {
    const result = await request(source.url, { followRedirect: true, headers })
    assert.equal(result.status, 200)
    for (const name of ['authorization', 'cookie', 'proxy-authorization']) assert.equal(received[name], undefined)
    assert.equal(headers.Authorization, 'Bearer fixture-only', 'redirect handling must not mutate caller options')
  } finally { await Promise.all([close(source.server), close(destination.server)]) }
})

test('Alipay transport preserves credentials on same-origin redirects', async () => {
  let received
  const source = await listen((req, res) => {
    if (req.url === '/') { res.writeHead(302, { Location: '/target' }); res.end() }
    else { received = req.headers; res.end('ok') }
  })
  try {
    const result = await request(source.url, { followRedirect: true, headers: { Authorization: 'Bearer fixture-only', Cookie: 'fixture=not-a-user-session' } })
    assert.equal(result.status, 200)
    assert.equal(received.authorization, 'Bearer fixture-only'); assert.equal(received.cookie, 'fixture=not-a-user-session')
  } finally { await close(source.server) }
})
