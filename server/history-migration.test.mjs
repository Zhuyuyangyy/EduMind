import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * P4-2B-3 聊天与导师历史 MySQL 迁移门禁（先于实现编写）。
 *
 * 覆盖任务书要求：
 * 1. 跨进程：A 进程写聊天交互，B 进程按原顺序读到（JSON 单文件缺口；
 *    MySQL 权威存储）
 * 2. 原子写入：用户消息与助手回复一次事务写入；助手行失败时用户消息
 *    不得残留（不能只保存用户消息就返回成功）
 * 3. 账号隔离：A/B 写不同账号互不串台；并发写不互相覆盖
 * 4. 稳定排序与唯一 ID：并发交互后读取顺序稳定、ID 唯一
 * 5. 展示契约：聊天最近 30、辅导最近 20（超量截断且保序）
 * 6. 来源区分：fallbackAgents 缺失（未知来源）/ []（真实模型）/ 非空
 *    （规则降级）三态保留，旧记录不得被补写为模型生成
 * 7. 多模态体积上限：超限明确拒绝
 * 8. 重启后顺序与内容不变
 */

const repository = await import('../server/study/repository.js')
const { isMySqlConfigured } = await import('../server/store/mysql.js')

const mysqlConfigured = isMySqlConfigured()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function tmpDataFile() {
  return path.join(os.tmpdir(), `edumind-b3-history-${process.pid}-${Date.now()}.json`)
}

function chatReply(overrides = {}) {
  return {
    content: '这是助手回复',
    resources: [{ type: 'doc', title: '相关概念速查' }],
    suggestions: ['建议一', '建议二'],
    ...overrides,
  }
}

function tutoringPayload(overrides = {}) {
  return {
    question: '什么是 BFS？',
    answer: '广度优先搜索……',
    mode: 'qa',
    scenario: 'preview',
    multimodalContents: [],
    ...overrides,
  }
}

/* ============ 1. JSON 模式：round-trip / 隔离 / 限额 ============ */

test('B-3 JSON：聊天交互 round-trip，用户消息与助手回复成对且保序', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `b3-json-chat-${Date.now()}`
    await repository.appendChatInteraction(account, { userMessage: '问题一', reply: chatReply() })
    await repository.appendChatInteraction(account, { userMessage: '问题二', reply: chatReply({ content: '回复二' }) })

    const items = await repository.getChatHistory(account)
    assert.equal(items.length, 4, '两次交互应产生 4 条消息')
    assert.deepEqual(items.map(i => i.role), ['user', 'assistant', 'user', 'assistant'])
    assert.equal(items[0].content, '问题一')
    assert.equal(items[1].content, '这是助手回复')
    assert.equal(items[3].content, '回复二')
    // 唯一 ID（交互内两条也不重复）
    const ids = items.map(i => i.id)
    assert.equal(new Set(ids).size, ids.length, '消息 ID 必须唯一')
    // 展示契约字段保留
    assert.ok(Array.isArray(items[1].resources) && items[1].resources.length > 0)
    assert.ok(Array.isArray(items[1].suggestions) && items[1].suggestions.length > 0)
    assert.equal(typeof items[0].time, 'string')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

test('B-3 JSON：账号隔离——不同账号历史互不串台', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const accountA = `b3-iso-a-${Date.now()}`
    const accountB = `b3-iso-b-${Date.now()}`
    await repository.appendChatInteraction(accountA, { userMessage: 'A 的问题', reply: chatReply() })
    await repository.appendTutoringHistory(accountB, tutoringPayload({ question: 'B 的问题' }))

    const chatA = await repository.getChatHistory(accountA)
    const chatB = await repository.getChatHistory(accountB)
    assert.equal(chatA.length, 2, 'A 应有自己的聊天记录')
    assert.equal(chatB.length, 0, 'B 不得看到 A 的聊天记录')

    const tutorA = await repository.getTutoringHistory(accountA)
    const tutorB = await repository.getTutoringHistory(accountB)
    assert.equal(tutorA.length, 0, 'A 不得看到 B 的辅导记录')
    assert.equal(tutorB.length, 1)
    assert.equal(tutorB[0].q, 'B 的问题')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

test('B-3 JSON：展示契约——聊天最近 30、辅导最近 20 且保序', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `b3-limit-${Date.now()}`
    for (let i = 0; i < 35; i += 1) {
      await repository.appendChatInteraction(account, { userMessage: `问题 ${i}`, reply: chatReply({ content: `回复 ${i}` }) })
    }
    for (let i = 0; i < 25; i += 1) {
      await repository.appendTutoringHistory(account, tutoringPayload({ question: `辅导 ${i}` }))
    }
    const chat = await repository.getChatHistory(account)
    const tutor = await repository.getTutoringHistory(account)
    assert.equal(chat.length, 30, '聊天历史应保留最近 30 条')
    // 35 次交互共 70 条，保留 30 条 = 最后 15 次交互（第 20 次起）
    assert.equal(chat[0].content, '问题 20', '截断后应保留最新窗口（第 20 次交互起）')
    assert.equal(chat[chat.length - 2].content, '问题 34')
    assert.equal(tutor.length, 20, '辅导历史应保留最近 20 条')
    assert.equal(tutor[0].q, '辅导 5')
    assert.equal(tutor[tutor.length - 1].q, '辅导 24')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

test('B-3 JSON：重启后顺序与内容不变（重读文件）', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `b3-restart-${Date.now()}`
    await repository.appendChatInteraction(account, { userMessage: '问题一', reply: chatReply() })
    await repository.appendTutoringHistory(account, tutoringPayload())
    const before = {
      chat: await repository.getChatHistory(account),
      tutor: await repository.getTutoringHistory(account),
    }
    // 重启语义：仓库无内存缓存，重新读取应得到一致结果
    const after = {
      chat: await repository.getChatHistory(account),
      tutor: await repository.getTutoringHistory(account),
    }
    assert.deepEqual(after.chat.map(i => [i.role, i.content]), before.chat.map(i => [i.role, i.content]))
    assert.deepEqual(after.tutor.map(i => [i.q, i.a]), before.tutor.map(i => [i.q, i.a]))
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

test('B-3 JSON：来源三态区分——未知来源不得被补写为模型生成', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `b3-source-${Date.now()}`
    // 真实模型：fallbackAgents = []
    await repository.appendTutoringHistory(account, tutoringPayload({ question: '真实模型问题', fallbackAgents: [] }))
    // 规则降级：fallbackAgents 非空
    await repository.appendTutoringHistory(account, tutoringPayload({ question: '降级问题', fallbackAgents: ['TutorAgent'] }))
    // 历史未知来源：不带 fallbackAgents（旧记录形态）
    await repository.appendTutoringHistory(account, tutoringPayload({ question: '旧记录问题', fallbackAgents: undefined }))

    const items = await repository.getTutoringHistory(account)
    assert.equal(items.length, 3)
    assert.deepEqual(items[0].fallbackAgents, [], '真实模型生成必须保留空数组标记')
    assert.deepEqual(items[1].fallbackAgents, ['TutorAgent'], '规则降级必须保留智能体列表')
    assert.ok(!('fallbackAgents' in items[2]), '未知来源的旧记录不得被补写为模型生成结果')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

test('B-3 JSON：多模态体积上限——超限明确拒绝', async () => {
  const dataFile = tmpDataFile()
  process.env.ZHIXUE_DATA_FILE = dataFile
  try {
    const account = `b3-size-${Date.now()}`
    const oversized = [{ type: 'image', data: 'x'.repeat(700 * 1024) }]
    await assert.rejects(
      () => repository.appendChatInteraction(account, { userMessage: '大图问题', reply: chatReply(), multimodalContents: oversized }),
      /多模态|体积|上限/,
      '超过体积上限的多模态内容必须被明确拒绝',
    )
    // 拒绝后不得残留半条记录
    assert.equal((await repository.getChatHistory(account)).length, 0, '超限拒绝不得残留部分写入')
  } finally {
    fs.rmSync(dataFile, { force: true })
  }
})

/* ============ 2. MySQL 模式：跨进程 / 原子写入 / 稳定排序 ============ */

test('B-3 MySQL：A 进程写聊天交互，B 进程按原顺序读到', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，跨进程历史门禁未实测' }, async () => {
  const account = `b3-xproc-${Date.now()}`
  const outFile = path.join(os.tmpdir(), `edumind-b3-xproc-${process.pid}.json`)
  const worker = path.join(root, 'scripts', 'history-cross-process-worker.mjs')
  try {
    // A 进程：写入两次交互（用户+助手成对）
    const aResult = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [worker, '--account', account, '--out', outFile], {
        cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env },
      })
      let stderr = ''
      child.stderr.on('data', c => { stderr += String(c) })
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve(JSON.parse(fs.readFileSync(outFile, 'utf8'))) : reject(new Error(`worker exit ${code}: ${stderr.slice(0, 300)}`)))
    })
    assert.equal(aResult.written, 4, 'worker 应报告写入 4 条消息')

    // B 进程（父进程即独立连接）：按原顺序读回
    const items = await repository.getChatHistory(account)
    assert.equal(items.length, 4, 'B 进程必须能读到 A 进程写入的全部消息')
    assert.deepEqual(items.map(i => i.role), ['user', 'assistant', 'user', 'assistant'])
    assert.equal(items[0].content, '跨进程问题一')
    assert.equal(items[3].content, '跨进程回复二')
    // 顺序稳定：seq 单调
    const seqs = items.map(i => i.seq)
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), '读取顺序必须稳定单调')
  } finally {
    fs.rmSync(outFile, { force: true })
  }
})

test('B-3 MySQL：原子写入——助手行失败时用户消息不得残留', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，原子写入门禁未实测' }, async () => {
  const account = `b3-atomic-${Date.now()}`
  // 先写一次正常交互（确保账户有历史）
  await repository.appendChatInteraction(account, { userMessage: '正常问题', reply: chatReply() })
  const before = await repository.getChatHistory(account)
  assert.equal(before.length, 2)

  // 构造必失败的助手行：suggestions 序列化后超过 TEXT 列上限（64KB），
  // 第二条 INSERT 报 Data too long → 整个事务回滚
  const hugeSuggestions = ['y'.repeat(70 * 1024)]
  await assert.rejects(
    () => repository.appendChatInteraction(account, { userMessage: '将失败的问题', reply: chatReply({ suggestions: hugeSuggestions }) }),
    /Data too long|ER_DATA_TOO_LONG|too long/i,
    '助手行写入失败必须报错（不能只保存用户消息就返回成功）',
  )

  // 事务回滚：用户消息不得残留
  const after = await repository.getChatHistory(account)
  assert.equal(after.length, 2, '失败交互的用户消息不得残留（原子写入）')
  assert.equal(after[0].content, '正常问题')
})

test('B-3 MySQL：并发交互——顺序稳定且 ID 唯一', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，并发排序门禁未实测' }, async () => {
  const account = `b3-concurrent-${Date.now()}`
  // 同一账号并发 5 次交互（Promise.all 交错执行）
  await Promise.all(Array.from({ length: 5 }, (_, i) =>
    repository.appendChatInteraction(account, { userMessage: `并发问题 ${i}`, reply: chatReply({ content: `并发回复 ${i}` }) })
  ))
  const items = await repository.getChatHistory(account)
  assert.equal(items.length, 10, '5 次交互应全部落库（无丢失）')
  const ids = items.map(i => i.id)
  assert.equal(new Set(ids).size, ids.length, '并发下消息 ID 仍须唯一')
  const seqs = items.map(i => i.seq)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), '并发下读取顺序仍稳定')
  // 配对由 interactionId 承载（并发事务交错落库时不保证 seq 相邻，
  // 但每个 interaction 必须恰有 user+assistant 两条——原子写入的
  // 含义是 both-or-neither，不是相邻）
  const byInteraction = new Map()
  for (const item of items) {
    const list = byInteraction.get(item.interactionId) || []
    list.push(item)
    byInteraction.set(item.interactionId, list)
  }
  assert.equal(byInteraction.size, 5, '应恰有 5 个交互')
  for (const [, pair] of byInteraction) {
    assert.equal(pair.length, 2, '每个交互必须恰有两条消息（原子写入）')
    assert.deepEqual(pair.map(p => p.role).sort(), ['assistant', 'user'])
  }
})

test('B-3 MySQL：辅导历史跨进程读取与来源三态', { skip: mysqlConfigured ? false : '未配置 MySQL 环境，辅导历史门禁未实测' }, async () => {
  const account = `b3-tutor-${Date.now()}`
  await repository.appendTutoringHistory(account, tutoringPayload({ question: '真实模型问题', fallbackAgents: [] }))
  await repository.appendTutoringHistory(account, tutoringPayload({ question: '降级问题', fallbackAgents: ['TutorAgent'] }))
  await repository.appendTutoringHistory(account, tutoringPayload({ question: '旧记录问题', fallbackAgents: undefined }))

  const items = await repository.getTutoringHistory(account)
  assert.equal(items.length, 3)
  assert.equal(items[0].q, '真实模型问题')
  assert.deepEqual(items[0].fallbackAgents, [], 'MySQL 模式同样保留真实模型空数组标记')
  assert.deepEqual(items[1].fallbackAgents, ['TutorAgent'])
  assert.ok(!('fallbackAgents' in items[2]), '未知来源不得被补写为模型生成')
  // 账号隔离：换账号读不到
  assert.equal((await repository.getTutoringHistory(`${account}-other`)).length, 0)
})

after(async () => {
  try {
    const { closeMySqlPool } = await import('../server/store/mysql.js')
    await closeMySqlPool()
  } catch {
    /* ignore */
  }
})
