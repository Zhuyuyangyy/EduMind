import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * P4-2B-2b 门禁（先于修复编写 · 复现复审指出的两个数据风险）：
 *
 * 风险 1（CAS 版本错配）：index.js 旧逻辑把 expectedVersion 取为
 * 「提交前最新读到的版本」，而 prepared.nextPath 是基于更早版本计算的。
 * 两会话交错时：A 基于 v5 计算 → B 写入 v6 → A 读到 v6 却拿 v5 的
 * 对象以 expectedVersion=6 提交 → CAS 成功但 B 的更新被静默覆盖。
 *
 * 风险 2（generate 覆盖）：/api/knowledge-path/generate 经无版本保护
 * 的 UPSERT 保存，生成结果无 version 字段时归一化为 v1，覆盖已有
 * 历史路径（版本倒退）。
 */

// 0.1 测试隔离（P4-2B-3b 同款修法）：JSON 用例经 repository →
// data.js，storePath 在模块加载时读 ZHIXUE_CHAT_STORE_FILE——必须在
// import repository 之前设置，否则写到默认 server/store.json
// （实测 mismatch/regen/strict 等账号残留在该文件）。
const ISOLATED_CHAT_STORE = path.join(os.tmpdir(), `edumind-b2b-iso-chat-${process.pid}.json`)
process.env.ZHIXUE_CHAT_STORE_FILE = ISOLATED_CHAT_STORE

const { preparePathUpdate } = await import('../server/study/profile-updater.js')
const repository = await import('../server/study/repository.js')
const { isMySqlConfigured } = await import('../server/store/mysql.js')

const mysqlConfigured = isMySqlConfigured()

function tmpDataFile() {
  return path.join(os.tmpdir(), `edumind-b2b-path-${process.pid}-${Date.now()}.json`)
}

function seedPath(overrides = {}) {
  const base = {
    version: 5,
    basedOn: 4,
    phases: [
      {
        id: 'phase-1',
        title: '阶段一',
        topics: [
          { id: 'topic-alpha', title: '知识点甲', mastery: 0.4 },
          { id: 'topic-beta', title: '知识点乙', mastery: 0.6 },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  }
  return { ...base, ...overrides }
}

/** 构造题库 + 快照解析器：exercise-alpha→topic-alpha，exercise-beta→topic-beta */
function installBankAndResolver() {
  const bankFile = path.join(os.tmpdir(), `edumind-b2b-bank-${process.pid}-${Date.now()}.json`)
  const bank = {
    version: 1,
    topics: [
      { id: 'topic-alpha', title: '知识点甲' },
      { id: 'topic-beta', title: '知识点乙' },
    ],
    exercises: [
      { id: 'exercise-alpha', topicId: 'topic-alpha', type: 'choice', prompt: '甲', options: ['A', 'B'], answer: 'A', explanation: 'x' },
      { id: 'exercise-beta', topicId: 'topic-beta', type: 'choice', prompt: '乙', options: ['A', 'B'], answer: 'A', explanation: 'x' },
    ],
  }
  fs.writeFileSync(bankFile, JSON.stringify(bank), 'utf8')
  process.env.ZHIXUE_EXERCISE_BANK_PATH = bankFile
  const snapshot = [
    { id: 'exercise-alpha', topicId: 'topic-alpha' },
    { id: 'exercise-beta', topicId: 'topic-beta' },
  ]
  const resolver = (id) => snapshot.find(item => item.id === id) || null
  return { resolver, cleanup: () => fs.rmSync(bankFile, { force: true }) }
}

/* ============ 风险 1：prepare 与提交之间版本改变 ============ */

test('复审回归：prepare 后版本被改，旧对象不得以新 expectedVersion 落库', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  const bank = installBankAndResolver()
  try {
    const account = `mismatch-${Date.now()}`
    await repository.saveKnowledgePathResult(account, seedPath())

    // 会话 A：基于 v5 准备（操作 topic-alpha）
    const attemptsA = [
      { exerciseId: 'exercise-alpha', correct: true, submitted: 'A', expected: 'A' },
      { exerciseId: 'exercise-alpha', correct: true, submitted: 'A', expected: 'A' },
    ]
    const preparedA = await preparePathUpdate({ accountId: account, session: { id: 'session-A' }, attempts: attemptsA, exerciseResolver: bank.resolver })
    assert.equal(preparedA.applied, true, preparedA.reason)
    assert.equal(preparedA.basedOn, 5, 'A 的准备必须基于 v5')
    assert.equal(preparedA.nextPath.version, 6)

    // 会话 B 抢先提交（v5 → v6，操作 topic-beta 0.6→0.7）
    const v6B = seedPath({
      version: 6,
      basedOn: 5,
      phases: [{ id: 'phase-1', title: '阶段一', topics: [
        { id: 'topic-alpha', title: '知识点甲', mastery: 0.4 },
        { id: 'topic-beta', title: '知识点乙', mastery: 0.7 },
      ] }],
    })
    const bCommit = await repository.commitPathUpdateCAS(account, v6B, { expectedVersion: 5, sessionId: 'session-B' })
    assert.equal(bCommit.ok, true, 'B 的提交应成功')

    // A 提交：复现 index.js 旧行为——expectedVersion 取「提交前最新读」（6），
    // 对象却是基于 v5 计算的。修复前 CAS 放行 → B 的更新被覆盖。
    const latestBeforeCommit = await repository.getLatestKnowledgePath(account)
    assert.equal(latestBeforeCommit.version, 6)
    const staleStyle = await repository.commitPathUpdateCAS(account, preparedA.nextPath, { expectedVersion: latestBeforeCommit.version, sessionId: 'session-A' })
    assert.equal(staleStyle.ok, false, '基于旧版本计算的对象不得以新 expectedVersion 落库（版本错配必须被拒）')

    // A 用正确口径（prepared.basedOn=5）提交 → 冲突 → 重新基于最新准备 → 成功
    const correctStyle = await repository.commitPathUpdateCAS(account, preparedA.nextPath, { expectedVersion: preparedA.basedOn, sessionId: 'session-A' })
    assert.equal(correctStyle.ok, false, '旧 basedOn 与当前版本不符应冲突')
    assert.equal(correctStyle.code, 'version-conflict')

    const attemptsA2 = [
      { exerciseId: 'exercise-alpha', correct: true, submitted: 'A', expected: 'A' },
      { exerciseId: 'exercise-alpha', correct: false, submitted: 'B', expected: 'A' },
    ]
    const preparedA2 = await preparePathUpdate({ accountId: account, session: { id: 'session-A' }, attempts: attemptsA2, exerciseResolver: bank.resolver })
    assert.equal(preparedA2.basedOn, 6, '重新准备必须基于最新 v6')
    const retry = await repository.commitPathUpdateCAS(account, preparedA2.nextPath, { expectedVersion: preparedA2.basedOn, sessionId: 'session-A' })
    assert.equal(retry.ok, true, '基于最新重算的提交应成功')

    // 两个会话的更新都必须保留（不得互相覆盖）
    const final = await repository.getLatestKnowledgePath(account)
    assert.equal(final.version, 7)
    assert.equal(final.phases[0].topics.find(t => t.id === 'topic-beta').mastery, 0.7, 'B 的更新不得丢失')
    assert.notEqual(final.phases[0].topics.find(t => t.id === 'topic-alpha').mastery, 0.4, 'A 的更新必须生效')
  } finally {
    bank.cleanup()
    fs.rmSync(dataFile, { force: true })
  }
})

/* ============ 风险 1b：DB 层严格递增校验 ============ */

test('复审回归：nextPath.version 必须严格等于 expectedVersion+1', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `strict-${Date.now()}`
    await repository.saveKnowledgePathResult(account, seedPath()) // v5

    // 跳版本：version=8, expected=5 → 拒
    const skip = await repository.commitPathUpdateCAS(account, seedPath({ version: 8, basedOn: 5 }), { expectedVersion: 5 })
    assert.equal(skip.ok, false, '跳版本提交必须被拒')
    assert.equal(skip.code, 'version-mismatch')

    // 版本不递增：version=5, expected=5 → 拒
    const noIncrease = await repository.commitPathUpdateCAS(account, seedPath({ version: 5, basedOn: 5 }), { expectedVersion: 5 })
    assert.equal(noIncrease.ok, false, '版本不递增必须被拒')
    assert.equal(noIncrease.code, 'version-mismatch')

    // 合法：version=6, expected=5 → 过
    const ok = await repository.commitPathUpdateCAS(account, seedPath({ version: 6, basedOn: 5 }), { expectedVersion: 5 })
    assert.equal(ok.ok, true, '合法递增应通过')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

/* ============ 风险 2：重新生成不得版本倒退 ============ */

test('复审回归：已有路径时重新生成不得把版本归一化回 1', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `regen-${Date.now()}`
    // 模拟反馈链路推进到 v6 的账号
    await repository.saveKnowledgePathResult(account, seedPath({ version: 6, basedOn: 5 }))

    // generate 端点保存新生成结果（无 version 字段）
    const generated = { phases: seedPath().phases, generatedAt: new Date().toISOString() }
    await repository.regenerateKnowledgePath(account, generated)

    const current = await repository.getLatestKnowledgePath(account)
    assert.equal(current.version, 7, `重新生成必须基于现有版本+1，实际=${current.version}`)
    assert.equal(current.basedOn, 6, 'basedOn 必须指向被取代的版本')

    // 无路径账号：首次生成从 v1 开始
    const fresh = `regen-fresh-${Date.now()}`
    await repository.regenerateKnowledgePath(fresh, generated)
    const freshPath = await repository.getLatestKnowledgePath(fresh)
    assert.equal(freshPath.version, 1, '首次生成必须为 v1')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

/* ============ MySQL 模式：同一契约在真实库上成立 ============ */

test('复审回归 MySQL：错配拒绝与重新生成版本语义走真实库', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，复审回归未实测' }, async () => {
  const account = `b2b-mysql-${Date.now()}`
  await repository.saveKnowledgePathResult(account, seedPath({ version: 6, basedOn: 5 }))

  // 严格递增：跳版本被拒
  const skip = await repository.commitPathUpdateCAS(account, seedPath({ version: 9, basedOn: 5 }), { expectedVersion: 6 })
  assert.equal(skip.ok, false)
  assert.equal(skip.code, 'version-mismatch')

  // 重新生成不倒退
  await repository.regenerateKnowledgePath(account, { phases: seedPath().phases })
  const current = await repository.getLatestKnowledgePath(account)
  assert.equal(current.version, 7, `MySQL 重新生成必须+1，实际=${current.version}`)
})

after(async () => {
  try {
    fs.rmSync(ISOLATED_CHAT_STORE, { force: true })
  } catch {
    /* ignore */
  }
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
})
