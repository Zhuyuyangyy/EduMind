import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'

/**
 * P3.4 MySQL 并发接管与 fencing 验收（测试 D）。
 *
 * 无 MySQL 环境时明确跳过并标注「未实测」——不得用 JSON 模式冒充
 * MySQL 验证结果。配置 MYSQL_URL 或 MYSQL_HOST/USER/DATABASE 后运行。
 */

const mysqlConfigured = Boolean(
  process.env.MYSQL_URL || (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE),
)

const SKIP_REASON = '未配置 MySQL 环境（MYSQL_URL / MYSQL_HOST+USER+DATABASE），MySQL 并发接管未实测'

test('MySQL：并发 claim 单飞（仅一个 claimed，其余 completed/in-progress）', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const { claimFeedback, mutateFeedback, getFeedbackState } = await import('./study/feedback-state.js')
  const accountId = `concurrent-${Date.now()}`
  const sessionId = `session-${Date.now()}`

  // 预置一条 completed 记录之外的全新 (account, session)，10 个并发抢占
  const claims = await Promise.all(Array.from({ length: 10 }, () => claimFeedback(accountId, sessionId)))
  const claimed = claims.filter(c => c.status === 'claimed')
  assert.equal(claimed.length, 1, `并发抢占只允许一个 claimed，实际=${claimed.length}`)
  assert.ok(claims.every(c => ['claimed', 'completed', 'in-progress'].includes(c.status)), '其余应为让位状态')

  const token = claimed[0].attempt
  const record = await getFeedbackState(accountId, sessionId)
  assert.equal(record.attempt, token, '状态记录的代际应与胜出者一致')
})

test('MySQL：CAS 接管与 fencing（旧执行器不得提交）', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const { claimFeedback, mutateFeedback, getFeedbackState } = await import('./study/feedback-state.js')
  const accountId = `cas-${Date.now()}`
  const sessionId = `session-${Date.now()}`

  const first = await claimFeedback(accountId, sessionId)
  assert.equal(first.status, 'claimed')

  // 第一次处理未完成（保持 processing）→ 第二个执行者超时接管（STALE_MS=0）
  process.env.ZHIXUE_FEEDBACK_STALE_MS = '0'
  const second = await claimFeedback(accountId, sessionId)
  assert.equal(second.status, 'claimed', '超时记录应被接管')
  assert.equal(second.attempt, first.attempt + 1, '接管应递增代际')

  // 旧执行器（第一代）尝试提交 → 必须被拒绝
  const staleWrite = await mutateFeedback(accountId, sessionId, first.attempt, r => ({ ...r, status: 'completed' }))
  assert.equal(staleWrite.ok, false, '旧执行器不得提交')
  assert.equal(staleWrite.code, 'stale-executor')

  // 新执行者（第二代）可以提交
  const freshWrite = await mutateFeedback(accountId, sessionId, second.attempt, r => ({ ...r, status: 'completed', result: { ok: true } }))
  assert.equal(freshWrite.ok, true, '新执行者应能提交')

  const record = await getFeedbackState(accountId, sessionId)
  assert.equal(record.status, 'completed')
  assert.equal(record.attempt, second.attempt)

  // completed 后任何 claim 都直接返回缓存结果
  const after = await claimFeedback(accountId, sessionId)
  assert.equal(after.status, 'completed')
  assert.deepEqual(after.result, { ok: true })
})

test('MySQL：恢复字段完整持久化（profileAfterValues/pendingRevision/partial）', { skip: mysqlConfigured ? false : SKIP_REASON }, async () => {
  const { claimFeedback, mutateFeedback, getFeedbackState } = await import('./study/feedback-state.js')
  const accountId = `fields-${Date.now()}`
  const sessionId = `session-${Date.now()}`

  const claim = await claimFeedback(accountId, sessionId)
  const payload = {
    profileAfterValues: { '逻辑思维': 54 },
    pendingRevision: { reason: '测试修订', sessionId },
    pathVersionAfter: 7,
    partial: { profileUpdate: { applied: true } },
  }
  const write = await mutateFeedback(accountId, sessionId, claim.attempt, r => ({ ...r, ...payload }))
  assert.equal(write.ok, true)

  const record = await getFeedbackState(accountId, sessionId)
  assert.deepEqual(record.profileAfterValues, payload.profileAfterValues, 'profileAfterValues 必须完整往返')
  assert.deepEqual(record.pendingRevision, payload.pendingRevision, 'pendingRevision 必须完整往返')
  assert.equal(record.pathVersionAfter, 7, 'pathVersionAfter 必须完整往返')
  assert.deepEqual(record.partial, payload.partial, 'partial 必须完整往返')
})
