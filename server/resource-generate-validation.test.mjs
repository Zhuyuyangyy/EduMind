import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withTestServer } from './test-server.mjs'

test('resource generation rejects malformed input before the agent/fallback branch', async () => {
  await withTestServer(async ({ post }) => {
    const login = await post('/api/auth/login', {
      account: 'reviewer',
      password: 'Zhixue2026!',
      role: 'student',
    })
    assert.equal(login.status, 200)
    const { token } = await login.json()

    const malformed = await post('/api/resources/generate', {}, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(malformed.status, 400)
    assert.deepEqual((await malformed.json()).details, ['topic is required', 'resourceType is required'])

    const wrongType = await post('/api/resources/generate', { topic: 42, resourceType: 'concept' }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(wrongType.status, 400)

    const paddedOverLimit = await post('/api/resources/generate', { topic: `${' '.repeat(201)}BFS`, resourceType: 'concept' }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(paddedOverLimit.status, 400)

    const paddedValid = await post('/api/resources/generate', { topic: '  BFS  ', resourceType: ' concept ' }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(paddedValid.status, 200)

    const valid = await post('/api/resources/generate', { topic: 'BFS', resourceType: 'concept' }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(valid.status, 200)
    const payload = await valid.json()
    assert.ok(Array.isArray(payload.resources))
    assert.equal(typeof payload.fallbackUsed, 'boolean')
  })
})
