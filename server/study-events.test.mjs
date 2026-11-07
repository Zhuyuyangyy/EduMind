import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P3-1 真实学习闭环验收测试。
 * 门禁：零题拒绝、非法题目拒绝、跨账号拒绝、重复提交不重复计分、
 *       完整练习评分持久化、答案不下发、统计来自真实完成事件。
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

async function createSession(baseUrl, auth, topicId = 'f1') {
  const res = await fetch(`${baseUrl}/api/study/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ topicId, exerciseCount: 3 }),
  })
  if (res.status !== 201) {
    assert.fail(`创建会话失败: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

async function submitAnswer(baseUrl, auth, sessionId, exerciseId, submitted, key) {
  return fetch(`${baseUrl}/api/study/sessions/${sessionId}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ exerciseId, submitted, idempotencyKey: key }),
  })
}

test('P3-1 完整闭环：3 题练习 → 服务端判分 → 完成 → 持久化', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    assert.equal(exercises.length, 3)
    // 创建响应不得包含答案与解析
    for (const exercise of exercises) {
      assert.ok(!('answer' in exercise), '题目响应不得包含正确答案')
      assert.ok(!('explanation' in exercise), '题目响应不得包含解析')
    }

    // 全部答对（按题库答案）
    const bank = await (await import('./study/repository.js')).loadExerciseBank()
    for (const exercise of exercises) {
      const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
      const res = await submitAnswer(baseUrl, auth, session.id, exercise.id, correctIndex, `key-${exercise.id}-a`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.correct, true)
      assert.equal(body.duplicate, false)
    }

    const complete = await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, {
      method: 'POST',
      headers: auth,
    })
    assert.equal(complete.status, 200)
    const { assessment } = await complete.json()
    assert.deepEqual(assessment, { total: 3, correct: 3, correctRate: 1 })

    // 持久化：重新读取会话状态，评分仍在
    const state = await (await fetch(`${baseUrl}/api/study/sessions/${session.id}`, { headers: auth })).json()
    assert.equal(state.session.status, 'completed')
    assert.equal(state.attempts.length, 3)
    assert.ok(state.attempts.every(a => a.correct))
  })
})

test('P3-1 幂等：重复提交（同键/异键）不重复计分', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    const target = exercises[0]
    const bank = await (await import('./study/repository.js')).loadExerciseBank()
    const correctIndex = bank.exercises.find(item => item.id === target.id).answer

    // 第一次提交
    const first = await (await submitAnswer(baseUrl, auth, session.id, target.id, correctIndex, 'idem-key-0001')).json()
    assert.equal(first.duplicate, false)
    assert.equal(first.progress.answered, 1)

    // 同一幂等键重试（网络超时后重发）→ 同一结果，不新增
    const retrySameKey = await (await submitAnswer(baseUrl, auth, session.id, target.id, correctIndex, 'idem-key-0001')).json()
    assert.equal(retrySameKey.duplicate, true)
    assert.equal(retrySameKey.correct, true)
    assert.equal(retrySameKey.progress.answered, 1, '同键重试不得重复计分')

    // 不同键但同会话同题 → 同样不重复计分
    const retryOtherKey = await (await submitAnswer(baseUrl, auth, session.id, target.id, correctIndex, 'idem-key-0002')).json()
    assert.equal(retryOtherKey.duplicate, true)
    assert.equal(retryOtherKey.progress.answered, 1, '异键同题不得重复计分')

    // 换一道题，进度正常 +1
    const second = await (await submitAnswer(baseUrl, auth, session.id, exercises[1].id, 0, 'idem-key-0003')).json()
    assert.equal(second.progress.answered, 2)

    // 完成幂等：重复 complete 返回同一评估
    await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: auth })
    const completeAgain = await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: auth })
    assert.equal(completeAgain.status, 200)
    const again = await completeAgain.json()
    assert.equal(again.duplicate, true)
    assert.equal(again.assessment.total, 2, '重复完成不得改变已记录题数')
  })
})

test('P3-1 拒绝：零题完成、非法题目、缺失幂等键', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const { session } = await createSession(baseUrl, auth, 'f1')

    // 零题完成拒绝
    const emptyComplete = await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: auth })
    assert.equal(emptyComplete.status, 400)
    assert.equal((await emptyComplete.json()).error, 'no-answers')

    // 非法题目拒绝
    const badExercise = await submitAnswer(baseUrl, auth, session.id, 'not-a-real-exercise', 0, 'idem-key-bad01')
    assert.equal(badExercise.status, 400)
    assert.equal((await badExercise.json()).error, 'invalid-exercise')

    // 不属于本会话的题目拒绝
    const foreignExercise = await submitAnswer(baseUrl, auth, session.id, 'dl-backprop', 0, 'idem-key-bad02')
    assert.equal(foreignExercise.status, 400)
    assert.equal((await foreignExercise.json()).error, 'exercise-not-in-session')

    // 缺失/过短幂等键拒绝
    const noKey = await submitAnswer(baseUrl, auth, session.id, session.exerciseIds[0], 0, 'short')
    assert.equal(noKey.status, 400)
    assert.equal((await noKey.json()).error, 'invalid-idempotency-key')
  })
})

test('P3-1 账号隔离：跨账号会话访问与作答一律 404', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const authA = await login(baseUrl, ACCOUNT_A)
    const authB = await login(baseUrl, ACCOUNT_B)

    const { session } = await createSession(baseUrl, authA, 'f1')

    // B 读 A 的会话 → 404（不泄露存在性）
    const crossRead = await fetch(`${baseUrl}/api/study/sessions/${session.id}`, { headers: authB })
    assert.equal(crossRead.status, 404)

    // B 代 A 会话作答 → 404
    const crossAnswer = await submitAnswer(baseUrl, authB, session.id, session.exerciseIds[0], 0, 'idem-key-cros1')
    assert.equal(crossAnswer.status, 404)

    // B 完成 A 的会话 → 404
    const crossComplete = await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: authB })
    assert.equal(crossComplete.status, 404)

    // A 的统计不受影响
    const statsB = await (await fetch(`${baseUrl}/api/study/stats`, { headers: authB })).json()
    assert.equal(statsB.completedSessions, 0)
    assert.equal(statsB.totalAnswers, 0)
  })
})

test('P3-1 判分确定性：错题判错、统计只认完成事件', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const { session, exercises } = await createSession(baseUrl, auth, 'f1')
    const bank = await (await import('./study/repository.js')).loadExerciseBank()

    // 第一题故意答错，后两题答对
    const wrong = bank.exercises.find(item => item.id === exercises[0].id).answer
    const wrongIndex = (wrong + 1) % (exercises[0].choices?.length || 4)
    const first = await (await submitAnswer(baseUrl, auth, session.id, exercises[0].id, wrongIndex, 'idem-key-w0001')).json()
    assert.equal(first.correct, false, '错误答案必须判错')

    for (const exercise of exercises.slice(1)) {
      const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
      await submitAnswer(baseUrl, auth, session.id, exercise.id, correctIndex, `idem-key-w-${exercise.id}`)
    }
    const complete = await (await fetch(`${baseUrl}/api/study/sessions/${session.id}/complete`, { method: 'POST', headers: auth })).json()
    assert.deepEqual(complete.assessment, { total: 3, correct: 2, correctRate: 0.6667 })

    // 统计：完成 1 会话、3 题、2 对、学习日 >= 1
    const stats = await (await fetch(`${baseUrl}/api/study/stats`, { headers: auth })).json()
    assert.equal(stats.completedSessions, 1)
    assert.equal(stats.totalAnswers, 3)
    assert.equal(stats.correctAnswers, 2)
    assert.ok(stats.studyDays >= 1, '学习日必须来自真实完成事件')

    // 未完成会话不计入统计
    const { session: open } = await createSession(baseUrl, auth, 'f1')
    const stats2 = await (await fetch(`${baseUrl}/api/study/stats`, { headers: auth })).json()
    assert.equal(stats2.completedSessions, 1, '未完成会话不得计入学习统计')
  })
})

test('P3-1 客户端无法自报正确率（服务端判分是唯一事实源）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const { session, exercises } = await createSession(baseUrl, auth, 'f1')

    // 客户端试图提交 correctRate/score 等字段——服务端忽略，只认答案
    const res = await fetch(`${baseUrl}/api/study/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        exerciseId: exercises[0].id,
        submitted: 999, // 越界选项
        correctRate: 1,
        score: 100,
        idempotencyKey: 'idem-key-fake01',
      }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.correct, false, '自报正确率不得生效；越界答案判错')
    assert.equal(body.progress.correct, 0, '不得通过自报字段加分')
  })
})
