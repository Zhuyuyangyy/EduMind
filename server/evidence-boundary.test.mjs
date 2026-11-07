import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P3-0 证据边界回归测试。
 * 核心命题：没有真实作答证据，就不能修改真实学习成绩。
 * 覆盖：客户端伪造画像被忽略、演示闭环不写真实画像、未核验标记可读取。
 */

async function login(baseUrl, account, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, role: 'student' }),
  })
  assert.equal(res.status, 200)
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}` }
}

async function saveStoredProfile(baseUrl, auth, dimensions, totalScore) {
  const res = await fetch(`${baseUrl}/api/profile/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ dimensions, totalScore, source: 'profile-save' }),
  })
  assert.equal(res.status, 200)
}

test('证据边界：客户端伪造的 profile 被忽略，基线只能来自服务端', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, 'reviewer', 'Zhixue2026!')
    // 服务端真实画像：综合分 50
    await saveStoredProfile(baseUrl, auth, [{ label: '知识基础', value: 50, color: '#3b82f6' }], 50)

    // 客户端提交一个高得多的伪造画像 + 自报正确率
    const update = await fetch(`${baseUrl}/api/learning-cycles/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        profile: { dimensions: [{ label: '知识基础', value: 99, color: '#f00' }], totalScore: 99 },
        exerciseResults: { correctRate: 1, attempted: 10 },
      }),
    })
    assert.equal(update.status, 200)
    const body = await update.json()

    // 响应必须基于服务端画像（50），而不是客户端伪造的 99
    const updatedScore = body.profile?.dimensions?.find(d => d.label === '知识基础')?.value
    assert.ok(updatedScore !== 99, `响应画像不得采用客户端伪造值，实际=${updatedScore}`)

    // 未核验标记
    assert.equal(body.evidence, 'unverified-client-input')
    assert.equal(body.verified, false)
    assert.match(body.notice || '', /未写入真实画像/)

    // 真实画像存储未被修改
    const latest = await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()
    assert.equal(latest.result.totalScore, 50, '演示闭环不得修改真实画像')
  })
})

test('证据边界：无画像时拒绝更新（不创造基线）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, 'student', 'student123')
    const update = await fetch(`${baseUrl}/api/learning-cycles/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ exerciseResults: { correctRate: 1 } }),
    })
    assert.equal(update.status, 400, '无真实画像时必须拒绝')
  })
})

test('证据边界：演示闭环记录带未核验标记且可读取', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, 'reviewer', 'Zhixue2026!')
    await saveStoredProfile(baseUrl, auth, [{ label: '知识基础', value: 60, color: '#3b82f6' }], 60)
    await fetch(`${baseUrl}/api/learning-cycles/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ exerciseResults: { correctRate: 0.9 } }),
    })

    const latest = await (await fetch(`${baseUrl}/api/learning-cycles/latest`, { headers: auth })).json()
    assert.equal(latest.result.evidence, 'unverified-client-input', '闭环记录必须带证据标记')
    // 归一契约仍含证据字段
    assert.ok('evidence' in latest.result)
  })
})

test('证据边界：空 body 演示更新不崩溃且不写真实画像', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, 'reviewer', 'Zhixue2026!')
    await saveStoredProfile(baseUrl, auth, [{ label: '知识基础', value: 55, color: '#3b82f6' }], 55)
    const update = await fetch(`${baseUrl}/api/learning-cycles/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({}),
    })
    assert.equal(update.status, 200)
    const latest = await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()
    assert.equal(latest.result.totalScore, 55, '空 body 也不得改动真实画像')
  })
})
