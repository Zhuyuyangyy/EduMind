import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * P4-2B-2 知识路径迁移门禁（先于实现编写）。
 *
 * 覆盖三条用户指出的链路：
 * 1. 跨进程：A 写路径 B 读不到（JSON 单文件语义的缺口；MySQL 门禁）
 * 2. 并发覆盖：同账号两个会话基于同一 version 计算，后写覆盖先写
 *    （JSON 无 CAS；MySQL 版本 CAS + 基于最新重算）
 * 3. 归因偏移：preparePathUpdate 收了 exerciseResolver 却直接用
 *    findExercise——题库升级后历史练习按新题库归因
 */

// 0.1 测试隔离（P4-2B-3a 同款修法）：知识路径 JSON 读写经 repository
// → data.js，其 storePath 在模块加载时读取 ZHIXUE_CHAT_STORE_FILE——
// 必须在 import repository 之前设置，否则 JSON 用例会写到默认
// server/store.json（P4-2B-3b 实测：resolver/cas/idempotent 等测试
// 账号残留在该文件）。ZHIXUE_DATA_FILE 供 study/store.js 使用，
// 两个变量都隔离。
const ISOLATED_CHAT_STORE = path.join(os.tmpdir(), `edumind-b2-iso-chat-${process.pid}.json`)
process.env.ZHIXUE_CHAT_STORE_FILE = ISOLATED_CHAT_STORE

const {
  preparePathUpdate,
} = await import('../server/study/profile-updater.js')
const repository = await import('../server/study/repository.js')
const { isMySqlConfigured } = await import('../server/store/mysql.js')

const mysqlConfigured = isMySqlConfigured()

function tmpDataFile() {
  return path.join(os.tmpdir(), `edumind-b2-path-${process.pid}-${Date.now()}.json`)
}

function seedPath(accountId, overrides = {}) {
  const base = {
    accountId,
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

/* ============ 1. 归因偏移：exerciseResolver 必须真正参与 ============ */

test('B-2 归因：preparePathUpdate 使用传入的 exerciseResolver（题库快照）', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `resolver-${Date.now()}`
    await repository.saveKnowledgePathResult(account, seedPath(account))

    // 会话快照：exercise-1 属于 topic-beta
    const snapshot = [{ id: 'exercise-1', topicId: 'topic-beta' }]
    const resolver = (id) => snapshot.find(item => item.id === id) || null

    // 当前题库（升级后）：exercise-1 被改到 topic-alpha
    // ——若实现直接用 findExercise，归因会错到 alpha
    const bankFile = path.join(os.tmpdir(), `edumind-b2-bank-${process.pid}.json`)
    const upgradedBank = {
      version: 99,
      topics: [
        { id: 'topic-alpha', title: '知识点甲' },
        { id: 'topic-beta', title: '知识点乙' },
      ],
      exercises: [
        { id: 'exercise-1', topicId: 'topic-alpha', type: 'choice', prompt: '升级后归属甲', options: ['A', 'B'], answer: 'A', explanation: 'x' },
      ],
    }
    fs.writeFileSync(bankFile, JSON.stringify(upgradedBank), 'utf8')
    process.env.ZHIXUE_EXERCISE_BANK_PATH = bankFile

    const attempts = [
      { exerciseId: 'exercise-1', correct: true, submitted: 'A', expected: 'A' },
      { exerciseId: 'exercise-1', correct: true, submitted: 'A', expected: 'A' },
      { exerciseId: 'exercise-1', correct: false, submitted: 'B', expected: 'A' },
    ]

    const prepared = await preparePathUpdate({ accountId: account, session: { id: 's1' }, attempts, exerciseResolver: resolver })
    assert.equal(prepared.applied, true, prepared.reason)

    const beta = prepared.nextPath.phases[0].topics.find(t => t.id === 'topic-beta')
    const alpha = prepared.nextPath.phases[0].topics.find(t => t.id === 'topic-alpha')
    assert.ok(beta.mastery !== 0.6, `快照归属的 topic-beta 应被更新，实际=${beta.mastery}`)
    assert.equal(alpha.mastery, 0.4, '未被快照归属的 topic-alpha 不得变化')
  } finally {
    fs.rmSync(dataFile, { force: true })
    delete process.env.ZHIXUE_EXERCISE_BANK_PATH
  }
})

/* ============ 2. 版本 CAS：冲突可检测、基于最新重算 ============ */

test('B-2 CAS：过期 expectedVersion 的提交被拒（冲突可检测）', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `cas-${Date.now()}`
    await repository.saveKnowledgePathResult(account, seedPath(account))

    // 第一个提交：基于 v5 → v6，成功
    const first = await repository.commitPathUpdateCAS(account, seedPath(account, { version: 6, basedOn: 5 }), { expectedVersion: 5 })
    assert.equal(first.ok, true, `基于最新版本的提交应成功: ${JSON.stringify(first)}`)

    // 第二个提交：仍基于 v5（并发场景的旧对象）→ 必须被拒
    const stale = await repository.commitPathUpdateCAS(account, seedPath(account, { version: 6, basedOn: 5 }), { expectedVersion: 5 })
    assert.equal(stale.ok, false, '过期 expectedVersion 必须被拒')
    assert.equal(stale.code, 'version-conflict')

    // 库中版本不被旧对象污染
    const current = await repository.getLatestKnowledgePath(account)
    assert.equal(current.version, 6)
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

test('B-2 CAS：冲突后基于最新路径重算再提交成功（不丢失更新）', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `casrc-${Date.now()}`
    await repository.saveKnowledgePathResult(account, seedPath(account))

    // 会话一先提交（v5→v6，beta 0.6→0.7）
    const v6 = seedPath(account, {
      version: 6,
      basedOn: 5,
      phases: [{ id: 'phase-1', title: '阶段一', topics: [
        { id: 'topic-alpha', title: '知识点甲', mastery: 0.4 },
        { id: 'topic-beta', title: '知识点乙', mastery: 0.7 },
      ] }],
    })
    assert.equal((await repository.commitPathUpdateCAS(account, v6, { expectedVersion: 5 })).ok, true)

    // 会话二基于旧 v5 计算的对象提交被拒 → 基于最新（v6）重算 → 提交成功
    const staleObject = seedPath(account, { version: 6, basedOn: 5 })
    assert.equal((await repository.commitPathUpdateCAS(account, staleObject, { expectedVersion: 5 })).ok, false)

    const latest = await repository.getLatestKnowledgePath(account)
    const recomputed = {
      ...latest,
      phases: latest.phases.map(p => ({ ...p, topics: p.topics.map(t => (t.id === 'topic-alpha' ? { ...t, mastery: 0.55 } : t)) })),
      version: latest.version + 1,
      basedOn: latest.version,
    }
    const retry = await repository.commitPathUpdateCAS(account, recomputed, { expectedVersion: latest.version })
    assert.equal(retry.ok, true, '基于最新重算的提交应成功')

    const final = await repository.getLatestKnowledgePath(account)
    assert.equal(final.version, 7)
    const alpha = final.phases[0].topics.find(t => t.id === 'topic-alpha')
    const beta = final.phases[0].topics.find(t => t.id === 'topic-beta')
    assert.equal(alpha.mastery, 0.55, '会话二的更新必须保留')
    assert.equal(beta.mastery, 0.7, '会话一的更新不得被覆盖丢失')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

/* ============ 3. 同会话重放不重复增加版本（账本唯一约束） ============ */

test('B-2 幂等：同一 sessionId 重复提交路径不产生第二条账本记录', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `idem-${Date.now()}`
    await repository.saveKnowledgePathResult(account, seedPath(account))
    const v6 = seedPath(account, { version: 6, basedOn: 5 })

    const first = await repository.commitPathUpdateCAS(account, v6, { expectedVersion: 5, sessionId: 'session-x' })
    assert.equal(first.ok, true)

    // 同一会话的重复提交（恢复对账场景）：被账本拒绝，不重复计数
    const replay = await repository.commitPathUpdateCAS(account, v6, { expectedVersion: 6, sessionId: 'session-x' })
    assert.equal(replay.ok, false, '同一 sessionId 的重复路径提交必须被拒')
    assert.equal(replay.code, 'session-already-applied')

    const current = await repository.getLatestKnowledgePath(account)
    assert.equal(current.version, 6, '重放不得推高版本')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

/* ============ 4. MySQL 模式：knowledge_paths 表契约 ============ */

test('B-2 MySQL：路径读写与 CAS 走 knowledge_paths 表', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，MySQL 路径门禁未实测' }, async () => {
  const account = `b2-path-${Date.now()}`
  await repository.saveKnowledgePathResult(account, seedPath(account))

  const readBack = await repository.getLatestKnowledgePath(account)
  assert.equal(readBack.version, 5, 'MySQL 模式应能读回所写路径')
  assert.equal(readBack.phases[0].topics[0].id, 'topic-alpha')

  const ok = await repository.commitPathUpdateCAS(account, seedPath(account, { version: 6, basedOn: 5 }), { expectedVersion: 5 })
  assert.equal(ok.ok, true, 'MySQL CAS 成功路径')
  const conflict = await repository.commitPathUpdateCAS(account, seedPath(account, { version: 6, basedOn: 5 }), { expectedVersion: 5 })
  assert.equal(conflict.ok, false, 'MySQL CAS 冲突必须可检测')
  assert.equal(conflict.code, 'version-conflict')
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
