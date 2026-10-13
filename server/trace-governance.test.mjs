import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * P4-2B-6 追踪治理门禁（先于实现编写）。
 *
 * 覆盖任务书 C1-C8：
 * 1. 默认脱敏：inputsSummary/outputsSummary 及 agentResults 摘要
 *    不得包含原始问题/回答文本（最小化）；调试开关显式开启才保留
 * 2. 保留策略：超过保留期的记录清理；每账号上限滚动删除
 * 3. 账号间读取隔离
 * 4. 多账号互不挤占（一个账号写满不影响另一账号）
 */

const TRACE_FILE = path.join(os.tmpdir(), `edumind-b6-trace-${process.pid}-${Date.now()}.json`)
process.env.ZHIXUE_TRACE_FILE = TRACE_FILE

const recorder = await import('../server/evidence/recorder.js')

after(() => {
  try { fs.rmSync(TRACE_FILE, { force: true }) } catch { /* ignore */ }
  delete process.env.ZHIXUE_TRACE_FILE
  delete process.env.ZHIXUE_TRACE_KEEP_CONTENT
})

/* ============ 1. 默认脱敏 ============ */

test('B-6 默认脱敏：追踪不落原始问题/回答文本（最小化）', () => {
  const trace = recorder.buildTrace({
    requestId: 'req-1',
    agents: ['ChatAgent'],
    inputsSummary: '我的隐私问题是：请解释波士顿房价预测中的过拟合',
    outputsSummary: '过拟合是指模型在训练集上表现良好但泛化能力差的现象，具体来说……',
    evidence: ['LLM 生成对话回复'],
    riskFlags: [],
    fallbackUsed: false,
    durationMs: 120,
    agentResults: [
      { agentName: 'ChatAgent', inputSummary: '原始输入：我的隐私问题', outputSummary: '原始输出：过拟合是指', confidence: 0.9, evidence: [], riskFlags: [], durationMs: 100, fallbackUsed: false },
    ],
  })
  recorder.recordTrace(trace)

  const [stored] = recorder.readTraces()
  // 顶层摘要脱敏
  assert.ok(!stored.inputsSummary.includes('隐私问题'), 'inputsSummary 不得包含原始问题文本')
  assert.ok(!stored.outputsSummary.includes('过拟合是指'), 'outputsSummary 不得包含原始回答文本')
  assert.match(stored.inputsSummary, /\d+字|长度|摘要/, `脱敏后应保留长度信息，实际=${stored.inputsSummary}`)
  // agentResults 摘要脱敏
  assert.ok(!stored.agentResults[0].inputSummary.includes('原始输入'), 'agent 输入摘要不得包含原文')
  assert.ok(!stored.agentResults[0].outputSummary.includes('原始输出'), 'agent 输出摘要不得包含原文')
  // 诊断元数据保留（非敏感）
  assert.equal(stored.agents[0], 'ChatAgent')
  assert.equal(stored.fallbackUsed, false)
  assert.equal(stored.durationMs, 120)
  assert.equal(stored.agentResults[0].confidence, 0.9)
})

test('B-6 调试开关：ZHIXUE_TRACE_KEEP_CONTENT=1 时保留原文', () => {
  process.env.ZHIXUE_TRACE_KEEP_CONTENT = '1'
  const trace = recorder.buildTrace({
    requestId: 'req-2',
    agents: ['ChatAgent'],
    inputsSummary: '调试原文问题',
    outputsSummary: '调试原文回答',
    evidence: [],
    riskFlags: [],
    fallbackUsed: false,
    durationMs: 10,
    agentResults: [],
  })
  recorder.recordTrace(trace)
  const stored = recorder.readTraces().find(t => t.requestId === 'req-2')
  assert.ok(stored, '应能读到 req-2 的 trace')
  assert.equal(stored.inputsSummary, '调试原文问题', '调试模式应保留原文（显式 opt-in）')
  delete process.env.ZHIXUE_TRACE_KEEP_CONTENT
})

/* ============ 2. 账号隔离 ============ */

test('B-6 账号隔离：A 的 trace 对 B 不可见', () => {
  recorder.runWithAccount('account-a', () => {
    recorder.recordTrace(recorder.buildTrace({
      requestId: 'req-a', agents: ['ChatAgent'], inputsSummary: 'A 的问题', outputsSummary: 'A 的回答',
      evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
    }))
  })
  recorder.runWithAccount('account-b', () => {
    recorder.recordTrace(recorder.buildTrace({
      requestId: 'req-b', agents: ['ChatAgent'], inputsSummary: 'B 的问题', outputsSummary: 'B 的回答',
      evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
    }))
  })

  const forA = recorder.readTracesForAccount('account-a')
  const forB = recorder.readTracesForAccount('account-b')
  assert.ok(forA.every(t => t.requestId !== 'req-b'), 'A 不得看到 B 的 trace')
  assert.ok(forB.every(t => t.requestId !== 'req-a'), 'B 不得看到 A 的 trace')
  assert.ok(forA.some(t => t.requestId === 'req-a'), 'A 应能看到自己的 trace')
})

/* ============ 3. 保留策略：每账号上限 ============ */

test('B-6 每账号上限：单账号超限滚动删除最旧，不挤占其他账号', () => {
  // account-heavy 写 150 条（默认上限 100）
  recorder.runWithAccount('account-heavy', () => {
    for (let i = 0; i < 150; i += 1) {
      recorder.recordTrace(recorder.buildTrace({
        requestId: `heavy-${i}`, agents: ['ChatAgent'], inputsSummary: `问题${i}`, outputsSummary: `回答${i}`,
        evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
      }))
    }
  })
  // account-light 写 5 条
  recorder.runWithAccount('account-light', () => {
    for (let i = 0; i < 5; i += 1) {
      recorder.recordTrace(recorder.buildTrace({
        requestId: `light-${i}`, agents: ['ChatAgent'], inputsSummary: `轻问题${i}`, outputsSummary: `轻回答${i}`,
        evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
      }))
    }
  })

  const heavy = recorder.readTracesForAccount('account-heavy')
  const light = recorder.readTracesForAccount('account-light')
  assert.ok(heavy.length <= 100, `单账号 trace 应受上限约束（100），实际=${heavy.length}`)
  assert.ok(!heavy.some(t => t.requestId === 'heavy-0'), '最旧的记录应被滚动删除')
  assert.ok(heavy.some(t => t.requestId === 'heavy-149'), '最新记录必须保留')
  assert.equal(light.length, 5, '其他账号的 trace 不得被挤占删除')
})

/* ============ 4. 保留期限 ============ */

test('B-6 保留期限：超过保留期的记录被清理', () => {
  // 直接写入一条 60 天前的 trace（默认保留 14 天）
  const raw = JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'))
  raw.push({
    requestId: 'ancient',
    accountId: 'account-old',
    timestamp: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    agents: ['ChatAgent'], inputsSummary: '旧问题', outputsSummary: '旧回答',
    evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
  })
  fs.writeFileSync(TRACE_FILE, JSON.stringify(raw), 'utf8')

  // 触发一次记录（读取路径做保留期过滤）
  recorder.runWithAccount('account-new', () => {
    recorder.recordTrace(recorder.buildTrace({
      requestId: 'fresh', agents: ['ChatAgent'], inputsSummary: '新问题', outputsSummary: '新回答',
      evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
    }))
  })

  const all = recorder.readTraces()
  assert.ok(!all.some(t => t.requestId === 'ancient'), '超过保留期的 trace 必须被清理')
  assert.ok(all.some(t => t.requestId === 'fresh'), '保留期内的 trace 必须保留')
})

/* ============ 审计补强：evidence/riskFlags 脱敏 ============ */

test('B-6 审计补强：evidence / agentResults evidence / riskFlags 默认脱敏', () => {
  const marker = 'SENSITIVE-LEAK-MARKER-XYZ'
  const trace = recorder.buildTrace({
    requestId: 'req-audit',
    agents: ['ChatAgent'],
    inputsSummary: '问题',
    outputsSummary: '回答',
    evidence: [`用户提问包含 ${marker}`, 'LLM 生成'],
    riskFlags: [`风险文本含 ${marker}`],
    fallbackUsed: false,
    durationMs: 5,
    agentResults: [
      { agentName: 'ChatAgent', inputSummary: '输入', outputSummary: '输出', evidence: [`agent 证据含 ${marker}`], riskFlags: [], confidence: 0.9, durationMs: 5, fallbackUsed: false },
    ],
  })
  recorder.recordTrace(trace)

  const raw = fs.readFileSync(TRACE_FILE, 'utf8')
  assert.ok(!raw.includes(marker), `trace 文件不得包含敏感标记（evidence/riskFlags 泄漏）: ${raw.slice(0, 200)}`)
  const stored = recorder.readTraces().find(t => t.requestId === 'req-audit')
  assert.ok(stored, '应能读到该 trace')
  assert.ok(stored.evidence.every(e => !String(e).includes(marker)), 'evidence 数组元素必须脱敏')
  assert.ok(stored.riskFlags.every(r => !String(r).includes(marker)), 'riskFlags 必须脱敏')
  assert.ok(stored.agentResults[0].evidence.every(e => !String(e).includes(marker)), 'agent evidence 必须脱敏')
  // 诊断元数据仍保留
  assert.equal(stored.evidence.length, 2, 'evidence 条目数应保留（脱敏不删条数）')
  assert.equal(stored.riskFlags.length, 1, 'riskFlags 条目数应保留')
})

/* ============ 审计补强：物理 TTL 清理 ============ */

test('B-6 审计补强：超期记录被物理删除（不仅是查询过滤）', () => {
  // 直接写入一条超期记录（无敏感标记，验证物理清理机制）
  const raw = JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'))
  raw.push({
    requestId: 'physical-ttl',
    accountId: 'account-ttl',
    timestamp: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    agents: ['ChatAgent'], inputsSummary: '旧', outputsSummary: '旧',
    evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
  })
  fs.writeFileSync(TRACE_FILE, JSON.stringify(raw), 'utf8')
  assert.ok(fs.readFileSync(TRACE_FILE, 'utf8').includes('physical-ttl'), '前置：超期记录应在文件中')

  // 触发一次读取（治理语义：读取即物理清理）
  const traces = recorder.readTraces()
  assert.ok(!traces.some(t => t.requestId === 'physical-ttl'), '读取结果不得包含超期记录')

  const afterRaw = fs.readFileSync(TRACE_FILE, 'utf8')
  assert.ok(!afterRaw.includes('physical-ttl'), '超期记录必须从磁盘物理删除，不能仅查询过滤')
})

/* ============ 审计补强：生产模式禁止原文开关 ============ */

test('B-6 审计补强：生产模式下 KEEP_CONTENT 开关被禁用（仍脱敏）', () => {
  process.env.ZHIXUE_TRACE_KEEP_CONTENT = '1'
  process.env.ZHIXUE_ENV = 'production'
  try {
    const trace = recorder.buildTrace({
      requestId: 'req-prod',
      agents: ['ChatAgent'],
      inputsSummary: '生产环境原文问题',
      outputsSummary: '生产环境原文回答',
      evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 1, agentResults: [],
    })
    recorder.recordTrace(trace)
    const stored = recorder.readTraces().find(t => t.requestId === 'req-prod')
    assert.ok(stored, '应能读到 trace')
    assert.ok(!String(stored.inputsSummary).includes('原文'), '生产模式下即使显式开启 KEEP_CONTENT 也必须脱敏')
  } finally {
    delete process.env.ZHIXUE_ENV
    delete process.env.ZHIXUE_TRACE_KEEP_CONTENT
  }
})
