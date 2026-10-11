import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P4-0 会话答案保密验收（先于修复编写，预期在当前版本失败）。
 *
 * 缺口：GET /api/study/sessions/:id 直接返回内部状态对象，其中
 * exerciseSnapshot 含 answer/explanation——active 会话即泄露标准答案。
 *
 * 要求：所有公开会话接口使用白名单 DTO；active 会话不得出现答案索引、
 * 解析或私有快照；completed 会话经授权+完成状态检查后才公开答案。
 */

const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }
const ACCOUNT_B = { account: 'student', password: 'student123' }

async function login(baseUrl, creds) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, role: 'student' }),
  })
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 递归查找响应中任何位置出现的题库答案标记 */
function findAnswerLeaks(node, bank, path = '$') {
  const leaks = []
  if (Array.isArray(node)) {
    node.forEach((item, index) => leaks.push(...findAnswerLeaks(item, bank, `${path}[${index}]`)))
    return leaks
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'answer' && typeof value === 'number') {
        leaks.push(`${path}.answer=${value}`)
      }
      if (key === 'explanation' && typeof value === 'string' && value.length > 5) {
        leaks.push(`${path}.explanation`)
      }
      if (key === 'exerciseSnapshot') {
        leaks.push(`${path}.exerciseSnapshot（私有快照泄露）`)
      }
      leaks.push(...findAnswerLeaks(value, bank, `${path}.${key}`))
    }
  }
  return leaks
}

test('active 会话状态接口不泄露标准答案（递归检查整个响应）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
    })).json()

    // 一道题都不答：active 会话
    const state = await fetch(`${baseUrl}/api/study/sessions/${created.session.id}`, { headers: auth })
    assert.equal(state.status, 200)
    const body = await state.json()

    const leaks = findAnswerLeaks(body)
    assert.equal(leaks.length, 0, `active 会话响应泄露答案: ${leaks.join(', ')}`)
  })
})

test('active 会话 /questions 接口同样不泄露（回归保护）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
    })).json()
    const questions = await (await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/questions`, { headers: auth })).json()
    const leaks = findAnswerLeaks({ exercises: questions.exercises })
    assert.equal(leaks.length, 0, `active /questions 泄露答案: ${leaks.join(', ')}`)
  })
})

test('completed 会话经授权后可通过结果接口获得答案', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const auth = await login(baseUrl, ACCOUNT_A)
    const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
    })).json()
    const bank = await (await import('./study/repository.js')).loadExerciseBank()
    for (const [index, exercise] of created.exercises.entries()) {
      const correctIndex = bank.exercises.find(item => item.id === exercise.id).answer
      await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/answers`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ exerciseId: exercise.id, submitted: correctIndex, idempotencyKey: `idem-leak-${index}` }),
      })
    }
    await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/complete`, { method: 'POST', headers: auth })

    const questions = await (await fetch(`${baseUrl}/api/study/sessions/${created.session.id}/questions`, { headers: auth })).json()
    assert.equal(questions.revealed, true, 'completed 会话应允许公开答案')
    const hasAnswers = questions.exercises.every(item => typeof item.answer === 'number')
    assert.ok(hasAnswers, 'completed 会话结果接口必须提供标准答案')
  })
})

test('账号 B 读不到 A 的会话（含 active/completed）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const authA = await login(baseUrl, ACCOUNT_A)
    const authB = await login(baseUrl, ACCOUNT_B)
    const created = await (await fetch(`${baseUrl}/api/study/sessions`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({ topicId: 'f1', exerciseCount: 3 }),
    })).json()

    for (const endpoint of [
      `/api/study/sessions/${created.session.id}`,
      `/api/study/sessions/${created.session.id}/questions`,
    ]) {
      const res = await fetch(baseUrl + endpoint, { headers: authB })
      assert.equal(res.status, 404, `${endpoint} 跨账号必须 404`)
      const text = await res.text()
      assert.ok(!text.includes('bfs-'), `${endpoint} 跨账号不得泄露题目内容`)
    }
  })
})
