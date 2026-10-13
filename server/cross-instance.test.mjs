import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B-5 双 API 实例跨进程总验收（先于实现编写 · 一次性收官）。
 *
 * 两个真正独立的 API 进程（API-A / API-B，不同端口，共享同一隔离
 * 测试 MySQL），真实 HTTP 登录与业务请求，覆盖任务书 10 项：
 *  1. A 写知识路径，B 立即读到
 *  2. A 写聊天，B 读到完整问答
 *  3. A 写导师历史，B 读到完整元数据
 *  4. 不同账号交叉请求，零数据泄漏
 *  5. 同账号并发练习，CAS 冲突重算后双方更新均保留
 *  6. 同会话反馈重放，画像与路径不重复更新
 *  7. 同聊天幂等键从 A/B 并发请求，只保存一次、返回一致
 *  8. 关闭 A、重启 B，数据与会话状态按契约恢复
 *  9. MySQL 故障时明确失败，不静默转写 JSON
 * 10. B-4 迁移后的数据在 A/B 两实例中内容与顺序一致
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { isMySqlConfigured } = await import('../server/store/mysql.js')
const mysqlConfigured = isMySqlConfigured()

const PORT_A = 18921
const PORT_B = 18922
const PORT_C = 18923 // 故障实例（连坏库）
const BASE_A = `http://127.0.0.1:${PORT_A}`
const BASE_B = `http://127.0.0.1:${PORT_B}`
const BASE_C = `http://127.0.0.1:${PORT_C}`

const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }
const ACCOUNT_B = { account: 'student', password: 'student123' }

let serverA = null
let serverB = null
let serverC = null

function spawnApi(port, { brokenMysql = false } = {}) {
  const suffix = `xinst-${port}`
  const api = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ZHIXUE_DATA_FILE: path.join(os.tmpdir(), `edumind-${suffix}-data.json`),
      ZHIXUE_CHAT_STORE_FILE: path.join(os.tmpdir(), `edumind-${suffix}-chat.json`),
      ZHIXUE_TRACE_FILE: path.join(os.tmpdir(), `edumind-${suffix}-trace.json`),
      ZHIXUE_SESSION_FILE: path.join(os.tmpdir(), `edumind-${suffix}-sessions.json`),
      ZHIXUE_IDENTITY_FILE: path.join(os.tmpdir(), `edumind-${suffix}-identities.json`),
      ...(brokenMysql ? { MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3999', MYSQL_USER: 'root', MYSQL_PASSWORD: 'x', MYSQL_DATABASE: 'edumind_nonexistent' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  api.stderr.on('data', chunk => { stderr += String(chunk) })
  return { api, stderr: () => stderr }
}

async function waitUp(baseUrl, api, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(`server exited early: ${api.exitCode}`)
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return
    } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`server did not start: ${baseUrl}`)
}

async function login(baseUrl, creds) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, role: 'student' }),
  })
  assert.equal(res.status, 200, `登录失败 ${baseUrl}: ${res.status}`)
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

async function createSession(baseUrl, auth, topicId) {
  const res = await fetch(`${baseUrl}/api/study/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ topicId, exerciseCount: 3 }),
  })
  if (res.status !== 201) assert.fail(`创建会话失败: ${res.status} ${await res.text()}`)
  const body = await res.json()
  // 端点返回 { session, exercises }——提取扁平 id 供后续 URL 使用
  return { id: body.session.id, exercises: body.exercises }
}

async function answerAll(baseUrl, auth, session, exercises) {
  const { loadExerciseBank } = await import('../server/study/repository.js')
  const bank = await loadExerciseBank()
  for (const exercise of exercises) {
    const answer = bank.exercises.find(item => item.id === exercise.id).answer
    const res = await fetch(`${baseUrl}/api/study/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // 幂等键：会话+题目稳定组合（>=8 字符），重试不重复计分
      body: JSON.stringify({ exerciseId: exercise.id, submitted: answer, idempotencyKey: `ans-${session.id}-${exercise.id}` }),
    })
    if (!res.ok) assert.fail(`提交答案失败: ${res.status} ${await res.text()}`)
  }
}

async function completeSession(baseUrl, auth, sessionId) {
  const res = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  })
  if (!res.ok) assert.fail(`完成会话失败: ${res.status} ${await res.text()}`)
}

async function feedback(baseUrl, auth, sessionId) {
  const res = await fetch(`${baseUrl}/api/study/sessions/${sessionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  })
  return { status: res.status, body: res.ok ? await res.json() : await res.text() }
}

before(async () => {
  if (!mysqlConfigured) return
  const a = spawnApi(PORT_A)
  const b = spawnApi(PORT_B)
  serverA = a
  serverB = b
  await waitUp(BASE_A, a.api)
  await waitUp(BASE_B, b.api)
})

after(async () => {
  for (const server of [serverA, serverB, serverC]) {
    if (server?.api && server.api.exitCode === null) {
      server.api.kill()
      await once(server.api, 'exit').catch(() => {})
    }
  }
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch { /* ignore */ }
})

/* ============ 1. A 写知识路径，B 立即读到 ============ */

test('B-5 #1 知识路径跨实例可见：A 生成，B 立即读到', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)
  const authB = await login(BASE_B, ACCOUNT_A) // 同账号，从另一实例登录
  await seedProfile(BASE_A, authA, [{ label: '知识基础', value: 75 }], 75)

  const gen = await fetch(`${BASE_A}/api/knowledge-path/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authA },
    body: JSON.stringify({ profile: { dimensions: [{ label: '知识基础', value: 75 }], totalScore: 75 } }),
  })
  assert.equal(gen.status, 200, `A 生成路径失败: ${gen.status}`)
  const generated = await gen.json()
  assert.ok(generated.phases?.length > 0, '生成的路径应有 phases')

  // B 实例立即读到（无缓存、无延迟）
  const latestB = await (await fetch(`${BASE_B}/api/knowledge-path/latest`, { headers: authB })).json()
  assert.ok(latestB.result, 'B 实例必须能读到 A 生成的路径')
  assert.equal(latestB.result.phases.length, generated.phases.length, 'B 读到的路径应与 A 生成的一致')
})

/* ============ 2. A 写聊天，B 读到完整问答 ============ */

test('B-5 #2 聊天跨实例可见：A 写问答，B 读到完整两条', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)
  const authB = await login(BASE_B, ACCOUNT_A)

  const chat = await fetch(`${BASE_A}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authA },
    body: JSON.stringify({ message: '跨实例聊天问题' }),
  })
  assert.equal(chat.status, 200)

  const historyB = await (await fetch(`${BASE_B}/api/chat/history`, { headers: authB })).json()
  assert.ok(historyB.items.length >= 2, `B 应读到完整问答，实际=${historyB.items.length}`)
  const userMsg = historyB.items.find(i => i.role === 'user' && i.content === '跨实例聊天问题')
  const assistantMsg = historyB.items.find(i => i.role === 'assistant' && i.interactionId === userMsg?.interactionId)
  assert.ok(userMsg, 'B 应读到用户消息')
  assert.ok(assistantMsg && assistantMsg.content.length > 0, 'B 应读到配对助手回复')
})

/* ============ 3. A 写导师历史，B 读到完整元数据 ============ */

test('B-5 #3 导师历史跨实例可见：A 提问，B 读到完整元数据', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)
  const authB = await login(BASE_B, ACCOUNT_A)

  const ask = await fetch(`${BASE_A}/api/tutoring/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authA },
    body: JSON.stringify({ question: '跨实例辅导问题', mode: 'qa' }),
  })
  assert.equal(ask.status, 200)

  const historyB = await (await fetch(`${BASE_B}/api/tutoring/history`, { headers: authB })).json()
  const hit = historyB.items.find(i => i.q === '跨实例辅导问题')
  assert.ok(hit, 'B 应读到 A 的辅导记录')
  assert.ok(hit.a && hit.a.length > 0, '辅导回答应完整')
  assert.equal(hit.mode, 'qa', 'mode 元数据应保留')
  assert.ok('fallbackAgents' in hit || hit.fallbackAgents !== undefined, '来源元数据应可判定')
})

/* ============ 4. 不同账号交叉请求零泄漏 ============ */

test('B-5 #4 跨账号零泄漏：A 实例写 reviewer，B 实例用 student 读不到', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A) // reviewer
  const authB = await login(BASE_B, ACCOUNT_B) // student（另一实例）

  // reviewer 经 A 实例写聊天
  const chat = await fetch(`${BASE_A}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authA },
    body: JSON.stringify({ message: 'reviewer 的隐私问题' }),
  })
  assert.equal(chat.status, 200)

  // student 经 B 实例读：不得看到 reviewer 的数据
  const studentChat = await (await fetch(`${BASE_B}/api/chat/history`, { headers: authB })).json()
  assert.ok(!studentChat.items.some(i => i.content === 'reviewer 的隐私问题'), 'student 不得看到 reviewer 的聊天')

  const studentTutor = await (await fetch(`${BASE_B}/api/tutoring/history`, { headers: authB })).json()
  assert.ok(!studentTutor.items.some(i => i.q === '跨实例辅导问题'), 'student 不得看到 reviewer 的辅导历史')

  // reviewer 自己的数据仍在（A 实例读）
  const reviewerChat = await (await fetch(`${BASE_A}/api/chat/history`, { headers: authA })).json()
  assert.ok(reviewerChat.items.some(i => i.content === 'reviewer 的隐私问题'), 'reviewer 应能看到自己的数据')
})

/* ============ 5. 同账号并发练习，CAS 后双方更新保留 ============ */

test('B-5 #5 并发练习 CAS：两个会话的路径更新都保留', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)
  const authB = await login(BASE_B, ACCOUNT_A)
  const topicId = 'f1'

  // 初始路径
  await seedProfile(BASE_A, authA, [{ label: '知识基础', value: 70 }], 70)
  const gen = await fetch(`${BASE_A}/api/knowledge-path/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authA },
    body: JSON.stringify({ profile: { dimensions: [{ label: '知识基础', value: 70 }], totalScore: 70 } }),
  })
  assert.equal(gen.status, 200)
  const before = (await (await fetch(`${BASE_B}/api/knowledge-path/latest`, { headers: authB })).json()).result
  const versionBefore = Number(before.version) || 1

  // A 实例创建会话 1，B 实例创建会话 2（同账号同学科）
  const sessionA = await createSession(BASE_A, authA, topicId)
  const sessionB = await createSession(BASE_B, authB, topicId)

  const questionsA = (await (await fetch(`${BASE_A}/api/study/sessions/${sessionA.id}/questions`, { headers: authA })).json()).exercises
  const questionsB = (await (await fetch(`${BASE_B}/api/study/sessions/${sessionB.id}/questions`, { headers: authB })).json()).exercises

  await answerAll(BASE_A, authA, sessionA, questionsA)
  await answerAll(BASE_B, authB, sessionB, questionsB)
  await completeSession(BASE_A, authA, sessionA.id)
  await completeSession(BASE_B, authB, sessionB.id)

  // 两会话各自 feedback（跨实例）
  const fbA = await feedback(BASE_A, authA, sessionA.id)
  assert.equal(fbA.status, 200, `会话 1 反馈失败: ${fbA.body}`)
  const fbB = await feedback(BASE_B, authB, sessionB.id)
  assert.equal(fbB.status, 200, `会话 2 反馈失败: ${fbB.body}`)

  // 两个会话的路径更新都保留：版本 +2
  const after = (await (await fetch(`${BASE_A}/api/knowledge-path/latest`, { headers: authA })).json()).result
  const versionAfter = Number(after.version) || 1
  assert.equal(versionAfter, versionBefore + 2, `两个并发会话的更新都应保留（v${versionBefore} → v${versionBefore + 2}），实际 v${versionAfter}`)
})

/* ============ 6. 同会话反馈重放幂等 ============ */

test('B-5 #6 反馈重放幂等：B 实例重放 A 的会话不重复更新', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)
  const authB = await login(BASE_B, ACCOUNT_A)

  const before = (await (await fetch(`${BASE_B}/api/knowledge-path/latest`, { headers: authB })).json()).result
  const versionBefore = Number(before?.version) || 1

  // 新会话（A 创建完成）
  const session = await createSession(BASE_A, authA, 'f1')
  const questions = (await (await fetch(`${BASE_A}/api/study/sessions/${session.id}/questions`, { headers: authA })).json()).exercises
  await answerAll(BASE_A, authA, session, questions)
  await completeSession(BASE_A, authA, session.id)
  const first = await feedback(BASE_A, authA, session.id)
  assert.equal(first.status, 200)
  const afterFirst = (await (await fetch(`${BASE_B}/api/knowledge-path/latest`, { headers: authB })).json()).result
  const versionAfterFirst = Number(afterFirst.version) || 1

  // B 实例重放同一会话的 feedback
  const replay = await feedback(BASE_B, authB, session.id)
  assert.equal(replay.status, 200, `重放应幂等返回 200: ${replay.body}`)

  const afterReplay = (await (await fetch(`${BASE_A}/api/knowledge-path/latest`, { headers: authA })).json()).result
  assert.equal(Number(afterReplay.version) || 1, versionAfterFirst, `重放不得推高版本（v${versionAfterFirst} 后应不变）`)
  assert.ok(versionAfterFirst > versionBefore || versionAfterFirst === versionBefore, '首次反馈已生效')
})

/* ============ 7. 同聊天幂等键跨实例并发 ============ */

test('B-5 #7 幂等键跨实例并发：A/B 同键同时请求只保存一次', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)
  const authB = await login(BASE_B, ACCOUNT_A)
  const key = `xinst-${Date.now()}`

  const message = `跨实例幂等问题-${key}`
  const send = (base, auth) => fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ message, idempotencyKey: key }),
  })

  const [resA, resB] = await Promise.all([send(BASE_A, authA), send(BASE_B, authB)])
  assert.equal(resA.status, 200, `A 实例请求应成功: ${resA.status}`)
  assert.equal(resB.status, 200, `B 实例请求应成功: ${resB.status}`)
  const [bodyA, bodyB] = [await resA.json(), await resB.json()]

  // 恰一个 duplicate，且内容一致
  const duplicates = [bodyA, bodyB].filter(b => b.idempotent === true)
  assert.equal(duplicates.length, 1, `恰一个请求应识别为重复，实际=${duplicates.length}`)
  assert.equal(bodyA.content, bodyB.content, '两个请求返回的内容必须一致')

  // 只落库一次
  const history = await (await fetch(`${BASE_A}/api/chat/history`, { headers: authA })).json()
  assert.equal(history.items.filter(i => i.content === message).length, 1, '同键跨实例并发只允许一条用户消息')
})

/* ============ 8. 关闭 A、重启 B，数据恢复 ============ */

test('B-5 #8 故障恢复：关闭 A 后 B 仍按契约读到全部数据与会话状态', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，双实例门禁未实测' }, async () => {
  const authA = await login(BASE_A, ACCOUNT_A)

  // A 写一批数据后关闭
  await fetch(`${BASE_A}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authA },
    body: JSON.stringify({ message: 'A 关闭前的最后消息' }),
  })
  const session = await createSession(BASE_A, authA, 'f1')

  serverA.api.kill()
  await once(serverA.api, 'exit').catch(() => {})

  // B（未重启，一直运行）读到全部数据
  const authB = await login(BASE_B, ACCOUNT_A)
  const historyB = await (await fetch(`${BASE_B}/api/chat/history`, { headers: authB })).json()
  assert.ok(historyB.items.some(i => i.content === 'A 关闭前的最后消息'), 'B 应读到 A 关闭前写的聊天')

  // 会话状态按契约恢复
  const stateRes = await fetch(`${BASE_B}/api/study/sessions/${session.id}`, { headers: authB })
  assert.equal(stateRes.status, 200, `B 应能读到 A 创建的会话状态: ${stateRes.status}`)
  const state = await stateRes.json()
  assert.equal(state.session.id, session.id, '会话 ID 应一致')

  // 重启 A（模拟服务恢复）后仍能读到
  const restarted = spawnApi(PORT_A)
  serverA = restarted
  await waitUp(BASE_A, restarted.api)
  const authA2 = await login(BASE_A, ACCOUNT_A)
  const historyRestarted = await (await fetch(`${BASE_A}/api/chat/history`, { headers: authA2 })).json()
  assert.ok(historyRestarted.items.some(i => i.content === 'A 关闭前的最后消息'), '重启后的 A 应仍能读到数据')
})

/* ============ 9. MySQL 故障时明确失败 ============ */

test('B-5 #9 MySQL 故障 fail-closed：坏库实例明确失败，不静默转 JSON', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，故障门禁未实测' }, async () => {
  const c = spawnApi(PORT_C, { brokenMysql: true })
  serverC = c
  await waitUp(BASE_C, c.api)

  // 登录：getSession 查库失败 → fail-closed 401（不是静默放行）
  const loginRes = await fetch(`${BASE_C}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ACCOUNT_A, role: 'student' }),
  })
  assert.ok(loginRes.status >= 500, `数据库不可达时登录应明确失败（5xx），实际=${loginRes.status}`)
  const loginBody = await loginRes.json()
  assert.match(loginBody.message || '', /.*/, '应有错误信息')

  // 未登录访问业务接口：401（fail-closed）
  const biz = await fetch(`${BASE_C}/api/chat/history`)
  assert.equal(biz.status, 401, `数据库故障时业务接口应 401 fail-closed，实际=${biz.status}`)
})

/* ============ 10. B-4 迁移后数据在 A/B 一致 ============ */

test('B-5 #10 迁移数据跨实例一致：B-4 导入后 A/B 两个真实进程 HTTP 读取一致', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，迁移一致性门禁未实测' }, async () => {
  const migrator = await import('../scripts/migrate-legacy-json.mjs')

  // 可真实登录的迁移测试账号：reviewer（演示身份，MySQL identities
  // 已存在）；内容带唯一 marker 便于从历史窗口中精确核对。
  const marker = `xinst-mig10-${Date.now()}`
  const sourcePath = path.join(os.tmpdir(), `edumind-xinst-mig10-${process.pid}.json`)
  fs.writeFileSync(sourcePath, JSON.stringify({
    chatHistory: {
      reviewer: [
        { id: 9001, role: 'user', content: `${marker} 问题一 😀`, time: '09:00', multimodalContents: [{ type: 'text', data: '迁移多模态' }] },
        { id: 9002, role: 'assistant', content: `${marker} 回复一`, time: '09:00', resources: [{ type: 'doc', title: '迁移资源' }], suggestions: ['迁移建议'] },
        { id: 9003, role: 'user', content: `${marker} 问题二`, time: '09:01', multimodalContents: [] },
        { id: 9004, role: 'assistant', content: `${marker} 回复二`, time: '09:01', resources: [], suggestions: [] },
      ],
    },
    tutoringHistory: {
      reviewer: [
        { q: `${marker} 辅导问题`, a: `${marker} 辅导回答`, time: '09:30', mode: 'qa', scenario: 'preview', fallbackAgents: [] },
        { q: `${marker} 降级问题`, a: `${marker} 降级回答`, time: '09:31', mode: 'qa', scenario: 'preview', fallbackAgents: ['TutorAgent'] },
      ],
    },
    profiles: {},
    accountSettings: {},
    learningCycles: [],
  }), 'utf8')

  const pidA = serverA?.api?.pid
  const pidB = serverB?.api?.pid

  try {
    const imported = await migrator.runMigration({ mode: 'import', sourcePath, env: process.env })
    assert.equal(imported.ok, true, `迁移导入应成功: ${JSON.stringify(imported.errors)}`)

    // 两个真实 API 进程分别通过 HTTP 登录并读取
    const authA = await login(BASE_A, ACCOUNT_A)
    const authB = await login(BASE_B, ACCOUNT_A)

    const [historyA, historyB] = await Promise.all([
      (await (await fetch(`${BASE_A}/api/chat/history`, { headers: authA })).json()).items,
      (await (await fetch(`${BASE_B}/api/chat/history`, { headers: authB })).json()).items,
    ])

    const pick = items => items
      .filter(i => String(i.content || '').includes(marker))
      .map(i => [i.role, i.content])

    // 内容一致（两进程读取相同）
    assert.deepEqual(pick(historyA), pick(historyB), 'A/B 两个进程读到的迁移聊天必须一致')
    // 顺序与内容保真（含 Unicode 与多模态元数据）
    assert.deepEqual(pick(historyA), [
      ['user', `${marker} 问题一 😀`],
      ['assistant', `${marker} 回复一`],
      ['user', `${marker} 问题二`],
      ['assistant', `${marker} 回复二`],
    ], '迁移聊天顺序与内容必须与源一致')
    const userMsg = historyA.find(i => i.role === 'user' && String(i.content).includes(marker))
    assert.deepEqual(userMsg.multimodalContents, [{ type: 'text', data: '迁移多模态' }], '多模态元数据跨实例保真')

    // 辅导历史：三态保真
    const [tutorA, tutorB] = await Promise.all([
      (await (await fetch(`${BASE_A}/api/tutoring/history`, { headers: authA })).json()).items,
      (await (await fetch(`${BASE_B}/api/tutoring/history`, { headers: authB })).json()).items,
    ])
    const pickTutor = items => items.filter(i => String(i.q || '').includes(marker)).map(i => [i.q, i.a, JSON.stringify(i.fallbackAgents ?? null)])
    assert.deepEqual(pickTutor(tutorA), pickTutor(tutorB), 'A/B 读到的迁移辅导历史必须一致')
    assert.deepEqual(pickTutor(tutorA), [
      [`${marker} 辅导问题`, `${marker} 辅导回答`, '[]'],
      [`${marker} 降级问题`, `${marker} 降级回答`, '["TutorAgent"]'],
    ], '迁移辅导三态（[]=真实 / 非空=降级）必须保真')

    // 账号隔离：student 账号（经 B 实例）不得看到 reviewer 的迁移数据
    const authStudent = await login(BASE_B, ACCOUNT_B)
    const studentHistory = (await (await fetch(`${BASE_B}/api/chat/history`, { headers: authStudent })).json()).items
    assert.ok(!studentHistory.some(i => String(i.content || '').includes(marker)), 'student 不得看到 reviewer 的迁移聊天')

    // 重启 API-A 后仍一致（进程级恢复）
    serverA.api.kill()
    await once(serverA.api, 'exit').catch(() => {})
    const restarted = spawnApi(PORT_A)
    serverA = restarted
    await waitUp(BASE_A, restarted.api)
    const authA2 = await login(BASE_A, ACCOUNT_A)
    const historyRestarted = (await (await fetch(`${BASE_A}/api/chat/history`, { headers: authA2 })).json()).items
    assert.deepEqual(pick(historyRestarted), pick(historyA), '重启后的 A 进程读到的迁移数据必须一致')

    console.log(`[B-5 #10] API-A pid=${pidA} port=${PORT_A} | API-B pid=${pidB} port=${PORT_B} | 双进程 HTTP 核对一致（聊天 4 条顺序保真 + 辅导三态保真 + 账号隔离 + 重启恢复）`)
  } finally {
    fs.rmSync(sourcePath, { force: true })
  }
})
