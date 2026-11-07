import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P3-2.1 反馈幂等复现测试（先于修复编写）。
 * 预期在当前版本（54535f1）失败：feedback 接口重复调用会重复应用
 * 画像/路径更新。修复后本文件全部通过。
 */

const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ACCOUNT_A, role: 'student' }),
  })
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}` }
}

async function seedProfile(baseUrl, auth) {
  const res = await fetch(`${baseUrl}/api/profile/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({
      dimensions: [{ label: '逻辑思维', value: 50, color: '#3b82f6' }],
      totalScore: 50,
      source: 'profile-save',
    }),
  })
  if (res.status !== 200) assert.fail(`建档失败: ${res.status} ${await res.text()}`)
}

async function runFullSession(baseUrl, auth) {
  const created = await fetch(`${baseUrl}/api/study/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
  })
  const { session, exercises } = await created.json()
  const bank = await (await import('./study/repository.js')).loadExerciseBank()
  for (const [index, exercise] of exercises.entries()) {
    const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
    await fetch(`${baseUrl}/api/study/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-${session.id}-${index}` }),
    })
  }
  await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: auth })
  return session.id
}

async function postFeedback(baseUrl, auth, sessionId) {
  const res = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, { method: 'POST', headers: auth })
  if (res.status !== 200) assert.fail(`feedback 失败: ${res.status} ${await res.text()}`)
  return res.json()
}

async function profileLogicValue(baseUrl, auth) {
  const profile = (await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()).result
  return profile.dimensions.find(d => d.label === '逻辑思维').value
}

test('复现：同一 session 重复 feedback 不得重复修改画像', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl)
    await seedProfile(baseUrl, auth)
    const sessionId = await runFullSession(baseUrl, auth)

    const first = await postFeedback(baseUrl, auth, sessionId)
    assert.equal(first.profileUpdate.applied, true)
    assert.equal(await profileLogicValue(baseUrl, auth), 54, '第一次应更新到 54')

    // 第二次相同请求（模拟重试/重复点击/App 重开）
    const second = await postFeedback(baseUrl, auth, sessionId)
    assert.equal(await profileLogicValue(baseUrl, auth), 54, `重复 feedback 后画像应仍为 54，实际=${await profileLogicValue(baseUrl, auth)}`)

    // 第三次
    await postFeedback(baseUrl, auth, sessionId)
    assert.equal(await profileLogicValue(baseUrl, auth), 54, '第三次 feedback 后画像应仍为 54')

    // 修订账本只允许一条
    const revisions = await (await fetch(`${baseUrl}/api/study/revisions`, { headers: auth })).json()
    assert.equal(revisions.items.length, 1, `修订账本应只有 1 条，实际=${revisions.items.length}`)

    // 路径版本只允许递增一次
    const path = (await (await fetch(`${baseUrl}/api/knowledge-path/latest`, { headers: auth })).json()).result
    if (path?.version) {
      assert.ok(path.version <= 2, `路径版本不应持续递增，实际=${path.version}`)
    }
  })
})

test('复现：同一 session 并发 feedback 最多一次有效修订', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl)
    await seedProfile(baseUrl, auth)
    const sessionId = await runFullSession(baseUrl, auth)

    // 5 个并发请求
    const results = await Promise.all(Array.from({ length: 5 }, () => postFeedback(baseUrl, auth, sessionId)))
    // 所有请求都应成功返回（或明确的状态码），但画像只能被改一次
    assert.equal(await profileLogicValue(baseUrl, auth), 54, '并发 feedback 后画像应为 54')

    const revisions = await (await fetch(`${baseUrl}/api/study/revisions`, { headers: auth })).json()
    assert.equal(revisions.items.length, 1, `并发下修订账本应只有 1 条，实际=${revisions.items.length}`)
  })
})

test('复现：画像派生字段一致（totalScore/radarPoints 跟随 dimensions）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl)
    // 建档时带 radarPoints/score 兼容字段
    const save = await fetch(`${baseUrl}/api/profile/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        dimensions: [
          { label: '逻辑思维', value: 50, color: '#3b82f6' },
          { label: '知识基础', value: 60, color: '#3b82f6' },
        ],
        radarPoints: [
          { dimension: '逻辑思维', score: 50 },
          { dimension: '知识基础', score: 60 },
        ],
        totalScore: 55,
        score: 55,
        source: 'profile-save',
      }),
    })
    if (save.status !== 200) assert.fail(`建档失败: ${save.status} ${await save.text()}`)

    const sessionId = await runFullSession(baseUrl, auth)
    const result = await postFeedback(baseUrl, auth, sessionId)
    assert.equal(result.profileUpdate.applied, true)

    const profile = (await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()).result
    const logic = profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54)

    // 派生字段必须跟随
    assert.equal(profile.totalScore, 57, `totalScore 应为 (54+60)/2=57，实际=${profile.totalScore}`)
    const radar = profile.radarPoints?.find(p => p.dimension === '逻辑思维')
    assert.equal(radar?.score, 54, `radarPoints 应同步为 54，实际=${radar?.score}`)
    if ('score' in profile) {
      assert.equal(profile.score, 57, `score 应同步为 57，实际=${profile.score}`)
    }
    // 来源字段不被篡改
    assert.equal(profile.source, 'profile-save')
  })
})

test('复现：单维度证据不足（仅 1 题）不得调整该维度', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl)
    const save = await fetch(`${baseUrl}/api/profile/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        dimensions: [
          { label: '逻辑思维', value: 50, color: '#3b82f6' },
          { label: '知识基础', value: 60, color: '#3b82f6' },
        ],
        totalScore: 55,
        source: 'profile-save',
      }),
    })
    if (save.status !== 200) assert.fail(`建档失败: ${save.status} ${await save.text()}`)

    // 混合主题会话：f1（3 题 → 逻辑思维）+ c2（1 题 → 知识基础）
    const created = await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ topicIds: ['f1', 'c2'], exerciseCount: 10 }),
    })
    if (created.status !== 201) assert.fail(`创建会话失败: ${created.status} ${await created.text()}`)
    const { session, exercises } = await created.json()
    assert.equal(exercises.length, 4, 'f1 三题 + c2 一题')

    const bank = await (await import('./study/repository.js')).loadExerciseBank()
    for (const [index, exercise] of exercises.entries()) {
      const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
      const res = await fetch(`${baseUrl}/api/study/sessions/${session.id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-mix-${index}` }),
      })
      assert.equal(res.status, 200)
    }
    await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: auth })

    const result = await postFeedback(baseUrl, auth, session.id)
    const profile = (await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()).result
    const knowledge = profile.dimensions.find(d => d.label === '知识基础')
    assert.equal(knowledge.value, 60, '仅 1 题证据的维度不得变化')

    // 逻辑思维有 3 题证据，允许 +4 更新；且原因中说明知识基础被跳过
    assert.equal(result.profileUpdate.applied, true)
    const logic = profile.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54)
    assert.ok(
      (result.profileUpdate.skippedDimensions || []).some(item => item.includes('知识基础')),
      `应记录知识基础因证据不足被跳过，实际=${JSON.stringify(result.profileUpdate.skippedDimensions)}`,
    )
  })
})
