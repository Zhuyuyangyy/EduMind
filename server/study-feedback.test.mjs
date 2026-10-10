import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P3-2 证据驱动反馈与受控画像更新验收测试。
 * 门禁：证据不足不更新 / 充分证据有界更新并留修订账本 /
 *       稳定区间不更新 / LLM 不可用时成绩不变反馈降级 /
 *       路径版本可追踪且知识点 ID 稳定 / 跨账号隔离。
 */

const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }
const ACCOUNT_B = { account: 'student', password: 'student123' }

async function login(baseUrl, creds) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, role: 'student' }),
  })
  assert.equal(res.status, 200)
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}` }
}

async function seedProfile(baseUrl, auth, dimensions, totalScore) {
  const res = await fetch(`${baseUrl}/api/profile/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ dimensions, totalScore, source: 'profile-save' }),
  })
  if (res.status !== 200) assert.fail(`建档失败: ${res.status} ${await res.text()}`)
}

async function createSession(baseUrl, auth, topicId = 'f1') {
  const res = await fetch(`${baseUrl}/api/study/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ topicId, exerciseCount: 3 }),
  })
  if (res.status !== 201) assert.fail(`创建会话失败: ${res.status} ${await res.text()}`)
  return res.json()
}

async function answerAll(baseUrl, auth, session, exercises, mode) {
  const bank = await (await import('./study/repository.js')).loadExerciseBank()
  for (const [index, exercise] of exercises.entries()) {
    const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
    const submitted = mode === 'all-correct' ? correctIndex : (mode === 'all-wrong' ? (correctIndex + 1) % (exercise.choices?.length || 4) : index % 2 === 0 ? correctIndex : (correctIndex + 1) % (exercise.choices?.length || 4))
    const res = await fetch(`${baseUrl}/api/study/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ exerciseId: exercise.id, submitted, idempotencyKey: `idem-${session.id}-${index}` }),
    })
    if (res.status !== 200) assert.fail(`提交答案失败: ${res.status} ${await res.text()}`)
  }
}

async function completeAndFeedback(baseUrl, auth, sessionId) {
  const complete = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/complete`, { method: 'POST', headers: auth })
  assert.equal(complete.status, 200)
  const feedback = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, {
    method: 'POST',
    headers: auth,
  })
  if (feedback.status !== 200) assert.fail(`反馈失败: ${feedback.status} ${await feedback.text()}`)
  return feedback.json()
}

async function latestProfile(baseUrl, auth) {
  return (await (await fetch(`${baseUrl}/api/profile/latest`, { headers: auth })).json()).result
}

test('P3-2 证据不足：2 题练习完成但不更新画像', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    await seedProfile(baseUrl, auth, [{ label: '逻辑思维', value: 50, color: '#3b82f6' }], 50)
    const before = await latestProfile(baseUrl, auth)

    // 只建 2 题的会话（低于门槛 3）
    const res = await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ topicId: 'f1', exerciseCount: 2 }),
    })
    const { session, exercises } = await res.json()
    await answerAll(baseUrl, auth, session, exercises, 'all-correct')
    const result = await completeAndFeedback(baseUrl, auth, session.id)

    // 评分是真实的
    assert.deepEqual(result.assessment, { total: 2, correct: 2, correctRate: 1 })
    // 但画像不更新（证据不足）
    assert.equal(result.profileUpdate.applied, false)
    assert.match(result.profileUpdate.reason, /证据不足/)

    const after = await latestProfile(baseUrl, auth)
    assert.equal(after.dimensions[0].value, before.dimensions[0].value, '证据不足不得改画像')
  })
})

test('P3-2 充分证据：全对 → 有界 +4 更新并写修订账本', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    await seedProfile(baseUrl, auth, [
      { label: '逻辑思维', value: 50, color: '#3b82f6' },
      { label: '知识基础', value: 60, color: '#3b82f6' },
    ], 55)
    const before = await latestProfile(baseUrl, auth)

    const { session, exercises } = await createSession(baseUrl, auth, 'f1') // f1 全映射逻辑思维
    await answerAll(baseUrl, auth, session, exercises, 'all-correct')
    const result = await completeAndFeedback(baseUrl, auth, session.id)

    assert.equal(result.profileUpdate.applied, true)
    const change = result.profileUpdate.changes.find(c => c.dimension === '逻辑思维')
    assert.ok(change, '逻辑思维应有变化')
    assert.equal(change.before, 50)
    assert.equal(change.after, 54, '单维度单次变化必须限制在 +4')
    assert.equal(change.delta, 4)
    assert.match(change.reason, /练习正确率 100%（3\/3 题）/)

    const after = await latestProfile(baseUrl, auth)
    const logic = after.dimensions.find(d => d.label === '逻辑思维')
    assert.equal(logic.value, 54, '画像必须真实持久化')
    // 未参与练习的维度不动
    assert.equal(after.dimensions.find(d => d.label === '知识基础').value, 60)

    // 修订账本：before/after/reason/eventIds/source/version 齐全
    const revisions = await (await fetch(`${baseUrl}/api/study/revisions`, { headers: auth })).json()
    assert.equal(revisions.items.length, 1)
    const revision = revisions.items[0]
    assert.ok(revision.before && revision.after, '修订必须记录前后快照')
    assert.equal(revision.source, 'rule')
    assert.equal(revision.version, 1)
    assert.ok(Array.isArray(revision.eventIds) && revision.eventIds.length >= 2, '修订必须关联学习事件')
    assert.ok(revision.reason.includes('逻辑思维'))
  })
})

test('P3-2 稳定区间：正确率 50% 不更新画像', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    await seedProfile(baseUrl, auth, [{ label: '逻辑思维', value: 50, color: '#3b82f6' }], 50)

    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    // 3 题对 1 题（rate=0.33 < 0.4 → 负向）与混合模式区分；
    // 这里用 mixed 得到 2/3 ≈ 0.67 落在稳定区间
    await answerAll(baseUrl, auth, session, exercises, 'mixed')
    const result = await completeAndFeedback(baseUrl, auth, session.id)

    assert.equal(result.profileUpdate.applied, false)
    assert.match(result.profileUpdate.reason, /稳定区间/)
    const after = await latestProfile(baseUrl, auth)
    assert.equal(after.dimensions[0].value, 50)
  })
})

test('P3-2 负向有界：全错 → -4 且不低于 0', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    await seedProfile(baseUrl, auth, [{ label: '逻辑思维', value: 2, color: '#3b82f6' }], 2)

    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    await answerAll(baseUrl, auth, session, exercises, 'all-wrong')
    const result = await completeAndFeedback(baseUrl, auth, session.id)

    assert.equal(result.profileUpdate.applied, true)
    const change = result.profileUpdate.changes[0]
    assert.equal(change.after, 0, '下限截断到 0')
    assert.equal(change.delta, -2)
  })
})

test('P3-2 LLM 隔离：无模型配置时成绩不变、反馈降级为规则', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    await seedProfile(baseUrl, auth, [{ label: '逻辑思维', value: 50, color: '#3b82f6' }], 50)

    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    await answerAll(baseUrl, auth, session, exercises, 'all-correct')
    const result = await completeAndFeedback(baseUrl, auth, session.id)

    // 评分完全不受 LLM 影响
    assert.deepEqual(result.assessment, { total: 3, correct: 3, correctRate: 1 })
    // 反馈降级且如实标注
    assert.equal(result.feedback.source, 'rule')
    assert.equal(result.feedback.degraded, true)
    assert.ok(result.feedback.text.length > 10, '降级反馈也必须有实质内容')
    assert.match(result.feedback.text, /3 题全部正确|正确率 100%/, '降级反馈必须引用真实数据')
    // 画像更新与反馈来源无关（规则判据）
    assert.equal(result.profileUpdate.applied, true)
  })
})

test('P3-2 路径版本：知识点 ID 稳定、版本递增、可追踪旧版', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    await seedProfile(baseUrl, auth, [{ label: '逻辑思维', value: 50, color: '#3b82f6' }], 50)
    // 先生成知识路径
    const genRes = await fetch(`${baseUrl}/api/knowledge-path/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({}),
    })
    assert.equal(genRes.status, 200)
    const beforePath = (await (await fetch(`${baseUrl}/api/knowledge-path/latest`, { headers: auth })).json()).result
    const beforeIds = beforePath.phases.flatMap(p => (p.topics || []).map(t => t.id)).sort()

    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    await answerAll(baseUrl, auth, session, exercises, 'all-correct')
    const result = await completeAndFeedback(baseUrl, auth, session.id)

    assert.equal(result.pathUpdate.applied, true)
    assert.equal(result.pathUpdate.basedOn, beforePath.version || 1)
    assert.equal(result.pathUpdate.version, (beforePath.version || 1) + 1)

    const afterPath = (await (await fetch(`${baseUrl}/api/knowledge-path/latest`, { headers: auth })).json()).result
    const afterIds = afterPath.phases.flatMap(p => (p.topics || []).map(t => t.id)).sort()
    assert.deepEqual(afterIds, beforeIds, '知识点 ID 必须保持稳定')
    assert.ok(afterPath.updateReason, '路径更新必须记录原因')
  })
})

test('P3-2 边界：未完成会话不生成反馈；跨账号 404', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const authA = await login(baseUrl, ACCOUNT_A)
    const authB = await login(baseUrl, ACCOUNT_B)
    await seedProfile(baseUrl, authA, [{ label: '逻辑思维', value: 50, color: '#3b82f6' }], 50)

    const { session } = await createSession(baseUrl, authA, 'f1')

    // 未完成 → 400
    const early = await fetch(`${baseUrl}/api/study/sessions/${session.id}/feedback`, { method: 'POST', headers: authA })
    assert.equal(early.status, 400)
    assert.equal((await early.json()).error, 'session-not-completed')

    // 完成后再验证跨账号
    const exercises = await getSessionExercises(baseUrl, authA, session.id)
    await answerAll(baseUrl, authA, session, exercises, 'all-correct')
    const complete = await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: authA })
    assert.equal(complete.status, 200)

    const cross = await fetch(`${baseUrl}/api/study/sessions/${session.id}/feedback`, { method: 'POST', headers: authB })
    assert.equal(cross.status, 404, '跨账号不得生成反馈')

    // B 的修订账本必须为空
    const revisionsB = await (await fetch(`${baseUrl}/api/study/revisions`, { headers: authB })).json()
    assert.deepEqual(revisionsB.items, [])
  })
})

async function getSessionExercises(baseUrl, auth, sessionId) {
  const state = await (await fetch(`${baseUrl}/api/study/sessions/${sessionId}`, { headers: auth })).json()
  return state.session.exerciseIds.map(id => ({ id }))
}
