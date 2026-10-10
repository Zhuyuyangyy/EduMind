import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLearningCycle } from './store/mysql.js'

/**
 * P2-2A 学习闭环契约测试。
 * JSON 与 MySQL 两种存储模式的返回结构历史上不一致（JSON 返回原始保存对象，
 * MySQL 按列重组），客户端无法用同一套类型安全消费。normalizeLearningCycle
 * 负责归一；这里分别用两种存储的原始形态做单测，再用 API 做集成往返。
 */

const CANONICAL_KEYS = [
  'workflowId', 'accountId', 'createdAt',
  'profile', 'profileBefore', 'profileChanges',
  'resourcePackage', 'tutoring', 'evaluation', 'path', 'reflection',
  'trace', 'agentResults',
]

test('契约：JSON 存储形态归一后字段集完整', () => {
  // JSON 模式保存的原始对象（orchestrateLearningUpdate 的返回值 + accountId/createdAt）
  const jsonShape = {
    workflowId: 'update-1',
    profileBefore: { dimensions: [], totalScore: 50 },
    profile: { dimensions: [{ label: '知识基础', value: 60 }], totalScore: 60 },
    profileChanges: [{ dimension: '知识基础', before: 50, after: 60, reason: '测评' }],
    evaluation: { mastery: [] },
    path: { phases: [] },
    reflection: { riskAssessment: { level: 'low' } },
    agentResults: [{ agentName: 'EvaluationAgent' }],
    trace: { requestId: 'learning-update-1' },
    accountId: 'reviewer',
    createdAt: '2026-10-10T00:00:00.000Z',
  }
  const normalized = normalizeLearningCycle(jsonShape)
  for (const key of CANONICAL_KEYS) {
    assert.ok(key in normalized, `缺少契约字段 ${key}`)
  }
  assert.equal(normalized.resourcePackage, null, 'JSON 形态没有 resourcePackage，应为 null 而不是缺失')
  assert.equal(normalized.tutoring, null, 'JSON 形态没有 tutoring，应为 null 而不是缺失')
  assert.equal(normalized.profileChanges.length, 1)
  assert.equal(normalized.agentResults.length, 1)
})

test('契约：MySQL 存储形态归一后字段集一致', () => {
  // MySQL 模式按列重组的对象（getLatestLearningCycle 的 MySQL 分支）
  const mysqlShape = {
    workflowId: 'update-2',
    accountId: 'student',
    profile: { dimensions: [], totalScore: 55 },
    resourcePackage: { resources: [] },
    tutoring: { answer: '…' },
    evaluation: { mastery: [] },
    path: { phases: [] },
    reflection: {},
    trace: {},
    createdAt: '2026-10-10T01:00:00.000Z',
  }
  const normalized = normalizeLearningCycle(mysqlShape)
  for (const key of CANONICAL_KEYS) {
    assert.ok(key in normalized, `缺少契约字段 ${key}`)
  }
  assert.equal(normalized.profileBefore, null, 'MySQL 不存 profileBefore，应为 null')
  assert.deepEqual(normalized.profileChanges, [], 'MySQL 不存 profileChanges，应为空数组')
  assert.deepEqual(normalized.agentResults, [], 'MySQL 不存 agentResults，应为空数组')
  assert.ok(normalized.resourcePackage, 'MySQL 形态应保留 resourcePackage')
  assert.ok(normalized.tutoring, 'MySQL 形态应保留 tutoring')
})

test('契约：两种形态归一后键集合完全相同', () => {
  const jsonKeys = Object.keys(normalizeLearningCycle({ workflowId: 'a', accountId: 'x' })).sort()
  const mysqlKeys = Object.keys(normalizeLearningCycle({
    workflowId: 'b', accountId: 'y', resourcePackage: {}, tutoring: {},
  })).sort()
  assert.deepEqual(jsonKeys, mysqlKeys)
  assert.deepEqual(jsonKeys, [...CANONICAL_KEYS].sort())
})

test('契约：null / 非对象输入安全返回 null', () => {
  assert.equal(normalizeLearningCycle(null), null)
  assert.equal(normalizeLearningCycle(undefined), null)
  assert.equal(normalizeLearningCycle('nope'), null)
})

test('契约：API 往返（JSON 存储模式）', async () => {
  const { withTestServer } = await import('./test-server.mjs')
  await withTestServer(async ({ baseUrl, post }) => {
    // 学习闭环接口需要登录态（Bearer）
    const login = await post('/api/auth/login', { account: 'reviewer', password: 'Zhixue2026!', role: 'student' })
    assert.equal(login.status, 200)
    const { token } = await login.json()
    const auth = { headers: { Authorization: `Bearer ${token}` } }

    // 先存画像（learning-cycles/update 的前置条件）
    const profileRes = await post('/api/profile/save', {
      dimensions: [{ label: '知识基础', value: 55, color: '#3b82f6' }],
      totalScore: 55,
    }, auth)
    assert.equal(profileRes.status, 200)

    const updateRes = await post('/api/learning-cycles/update', {}, auth)
    assert.equal(updateRes.status, 200, '闭环更新应成功')
    const { workflowId } = await updateRes.json()
    assert.ok(workflowId, '应返回 workflowId')

    const latestRes = await fetch(`${baseUrl}/api/learning-cycles/latest`, { headers: auth.headers })
    assert.equal(latestRes.status, 200)
    const { result } = await latestRes.json()
    for (const key of CANONICAL_KEYS) {
      assert.ok(key in result, `API 响应缺少契约字段 ${key}`)
    }
    assert.equal(result.workflowId, workflowId)
  })
})
