import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { test } from 'node:test'
import { buildAvatarSessionPayload, isAvatarConfigured, mintAvatarSignedUrl } from './avatar-session.js'

const SERVER = 'wss://avatar.cn-huadong-1.xf-yun.com/v1/interact'
const DATE = 'Mon, 17 Nov 2026 12:00:00 GMT'

test('signedUrl matches the iFlytek host/date/request-line HMAC-SHA256 scheme', () => {
  const url = mintAvatarSignedUrl({ serverUrl: SERVER, apiKey: 'test-key', apiSecret: 'test-secret', date: DATE })
  const signature = crypto.createHmac('sha256', 'test-secret')
    .update(`host: avatar.cn-huadong-1.xf-yun.com\ndate: ${DATE}\nGET /v1/interact HTTP/1.1`)
    .digest('base64')
  const authorization = Buffer.from(
    `api_key="test-key", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`,
    'utf8',
  ).toString('base64')
  assert.equal(url, `${SERVER}?authorization=${authorization}&date=${DATE}&host=avatar.cn-huadong-1.xf-yun.com`)
})

test('session payload exposes only signedUrl and serverUrl, never the secret', () => {
  process.env.AVATAR_API_KEY = 'test-key'
  process.env.AVATAR_API_SECRET = 'test-secret'
  try {
    assert.equal(isAvatarConfigured(), true)
    const payload = buildAvatarSessionPayload()
    assert.ok(payload.signedUrl.startsWith(SERVER + '?authorization='))
    assert.equal(payload.serverUrl, SERVER)
    assert.doesNotMatch(JSON.stringify(payload), /test-secret/)
    assert.deepEqual(Object.keys(payload).sort(), ['serverUrl', 'signedUrl'])
  } finally {
    delete process.env.AVATAR_API_KEY
    delete process.env.AVATAR_API_SECRET
  }
})

test('unconfigured avatar yields no session so the client stays on standby', () => {
  delete process.env.AVATAR_API_KEY
  delete process.env.AVATAR_API_SECRET
  assert.equal(isAvatarConfigured(), false)
  assert.equal(buildAvatarSessionPayload(), null)
})