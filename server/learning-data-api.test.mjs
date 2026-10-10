import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'

/**
 * P2-2A 账号级学习数据契约测试。
 * 覆盖：画像 / 知识路径 / 辅导历史的账号隔离、空账号行为、
 *       静态演示端点不得被当作账号真实数据。
 */

const ACCOUNT_A = { account: 'reviewer', password: 'Zhixue2026!' }
const ACCOUNT_B = { account: 'student', password: 'student123' }

async function login(baseUrl, creds) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, role: 'student' }),
  })
  assert.equal(res.status, 200, `登录失败: ${creds.account}`)
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}` }
}

test('账号数据：画像与知识路径按账号隔离，空账号返回 null', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const authA = await login(baseUrl, ACCOUNT_A)
    const authB = await login(baseUrl, ACCOUNT_B)

    // A 先存画像并生成知识路径
    const saveRes = await fetch(`${baseUrl}/api/profile/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authA },
      body: JSON.stringify({
        dimensions: [{ label: '知识基础', value: 70, color: '#3b82f6' }],
        totalScore: 70,
      }),
    })
    assert.equal(saveRes.status, 200)

    const genRes = await fetch(`${baseUrl}/api/knowledge-path/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authA },
      body: JSON.stringify({}),
    })
    assert.equal(genRes.status, 200, '生成知识路径应成功')
    const pathA = await genRes.json()
    assert.ok(Array.isArray(pathA.phases) && pathA.phases.length > 0, '路径应包含 phases')
    for (const phase of pathA.phases) {
      assert.ok(typeof phase.id === 'string' && typeof phase.name === 'string')
      for (const topic of phase.topics || []) {
        assert.ok(typeof topic.id === 'string', 'topic 必须有 id（可追溯）')
        assert.equal(typeof topic.mastery, 'number')
        assert.equal(typeof topic.importance, 'number')
        assert.equal(typeof topic.recommended, 'boolean')
      }
    }

    // A 读得到自己的数据
    const profileA = await (await fetch(`${baseUrl}/api/profile/latest`, { headers: authA })).json()
    assert.equal(profileA.result?.totalScore, 70)
    const latestA = await (await fetch(`${baseUrl}/api/knowledge-path/latest`, { headers: authA })).json()
    assert.ok(latestA.result?.phases?.length > 0, 'A 应读到自己生成的路径')

    // B 没有任何数据：必须是 null / 空，而不是 A 的数据
    const profileB = await (await fetch(`${baseUrl}/api/profile/latest`, { headers: authB })).json()
    assert.equal(profileB.result, null, 'B 无画像时应为 null')
    const latestB = await (await fetch(`${baseUrl}/api/knowledge-path/latest`, { headers: authB })).json()
    assert.equal(latestB.result, null, 'B 无路径时应为 null，绝不允许串号')
  })
})

test('账号数据：辅导历史按账号隔离，新记录携带降级元数据', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const authA = await login(baseUrl, ACCOUNT_A)
    const authB = await login(baseUrl, ACCOUNT_B)

    // A 提一个问题（无 LLM → 走规则降级，fallbackAgents 非空）
    const askRes = await fetch(`${baseUrl}/api/tutoring/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authA },
      body: JSON.stringify({ question: 'BFS 的 visited 什么时候标记？', mode: 'qa' }),
    })
    assert.equal(askRes.status, 200)

    const historyA = await (await fetch(`${baseUrl}/api/tutoring/history`, { headers: authA })).json()
    assert.equal(historyA.items.length, 1, 'A 应有 1 条历史')
    assert.equal(typeof historyA.items[0].q, 'string')
    assert.equal(typeof historyA.items[0].a, 'string')
    assert.ok(Array.isArray(historyA.items[0].fallbackAgents), '新历史应携带 fallbackAgents 元数据')

    // B 的历史必须为空
    const historyB = await (await fetch(`${baseUrl}/api/tutoring/history`, { headers: authB })).json()
    assert.deepEqual(historyB.items, [], 'B 不应看到 A 的辅导历史')
  })
})

test('账号数据：静态演示端点不是账号数据（有响应但无账号隔离语义）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // 这些端点返回静态内容，UI 层必须标注为演示，不得当作账号真实学习结果
    const learningPath = await (await fetch(`${baseUrl}/api/learning-path`)).json()
    assert.ok(learningPath && typeof learningPath === 'object', '静态 learning-path 有响应')
    const evaluation = await (await fetch(`${baseUrl}/api/evaluation`)).json()
    assert.ok(evaluation && typeof evaluation === 'object', '静态 evaluation 有响应')
    const recommended = await (await fetch(`${baseUrl}/api/resources/recommended`)).json()
    assert.ok(recommended && typeof recommended === 'object', '静态推荐有响应')
  })
})

test('账号数据：学习闭环 null 行为（无闭环时返回 null 而非伪造）', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const authB = await login(baseUrl, ACCOUNT_B)
    const latest = await (await fetch(`${baseUrl}/api/learning-cycles/latest`, { headers: authB })).json()
    assert.equal(latest.result, null, '无闭环记录的账号必须拿到 null')
  })
})
