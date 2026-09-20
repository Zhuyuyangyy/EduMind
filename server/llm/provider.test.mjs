import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'

test('LLM timeout and invalid JSON both return the declared fallback shape', async () => {
  let mode = 'invalid-json'
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      const respond = () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: mode === 'invalid-json' ? 'not json' : '{"ok":true}' } }] }))
      }
      if (mode === 'slow') setTimeout(respond, 250)
      else respond()
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  process.env.LLM_API_URL = `http://127.0.0.1:${address.port}`
  process.env.LLM_API_KEY = 'test-key'
  process.env.LLM_MODEL = 'test-model'
  process.env.LLM_TIMEOUT_MS = '50'

  try {
    const provider = await import(`./provider.js?test=${Date.now()}`)
    const fallback = { ok: false, fields: [] }
    const invalid = await provider.generateStructuredJson({
      systemPrompt: 'system', userPrompt: 'user', fallback,
    })
    assert.equal(invalid.fallbackUsed, true)
    assert.deepEqual(invalid.data, fallback)

    mode = 'slow'
    const started = Date.now()
    const timedOut = await provider.callLlm('system', 'user')
    assert.equal(timedOut.fallbackUsed, true)
    assert.match(timedOut.error, /timeout|aborted/i)
    assert.ok(Date.now() - started < 1000)
  } finally {
    server.close()
    delete process.env.LLM_API_URL
    delete process.env.LLM_API_KEY
    delete process.env.LLM_MODEL
    delete process.env.LLM_TIMEOUT_MS
  }
})
