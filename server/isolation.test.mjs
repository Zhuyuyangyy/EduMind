import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

/**
 * 数据隔离单元测试（P0 · feat/mobile-v1）
 * 覆盖：聊天/辅导历史、知识路径的账号隔离与旧格式迁移；
 *       协作看板聚合不泄露 trace 中的用户内容。
 */

// data.js 在模块加载时读取存储路径，先设环境变量再动态导入
const DATA_FILE = path.join(os.tmpdir(), `edumind-unit-data-${process.pid}.json`)
process.env.ZHIXUE_CHAT_STORE_FILE = DATA_FILE

const {
  getChatHistory,
  saveChatHistoryEntry,
  getTutoringHistory,
  saveTutoringHistoryEntry,
  getLatestKnowledgePath,
  saveKnowledgePathResult,
} = await import('./data.js')

function resetStore() {
  fs.rmSync(DATA_FILE, { force: true })
}

test.afterEach(() => {
  resetStore()
})

test('聊天与辅导历史按账号隔离', () => {
  resetStore()
  saveChatHistoryEntry('alice', 'alice 的问题', { content: '给 alice 的回复', resources: [], suggestions: [] }, [])
  saveTutoringHistoryEntry('alice', { question: 'alice 提问', answer: 'alice 的解答', mode: 'qa' })
  saveChatHistoryEntry('bob', 'bob 的问题', { content: '给 bob 的回复', resources: [], suggestions: [] }, [])

  const aliceChat = getChatHistory('alice')
  assert.equal(aliceChat.length, 2)
  assert.ok(aliceChat.some(item => item.content === 'alice 的问题'))
  assert.ok(!aliceChat.some(item => item.content === 'bob 的问题'), 'alice 不能看到 bob 的聊天')

  const bobChat = getChatHistory('bob')
  assert.equal(bobChat.length, 2)
  assert.ok(!bobChat.some(item => item.content === 'alice 的问题'), 'bob 不能看到 alice 的聊天')

  const aliceTutoring = getTutoringHistory('alice')
  assert.equal(aliceTutoring.length, 1)
  assert.equal(getTutoringHistory('bob').length, 0, '辅导历史同样按账号隔离')
})

test('旧格式全局历史数据迁移为 default 账号可见', () => {
  resetStore()
  // 改造前的旧格式：chatHistory 是全局数组
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    chatHistory: [
      { id: 1, role: 'user', content: '改造前的历史消息', time: '00:00' },
      { id: 2, role: 'assistant', content: '改造前的历史回复', time: '00:00' },
    ],
    tutoringHistory: [],
  }), 'utf8')

  const legacy = getChatHistory('default')
  assert.equal(legacy.length, 2, '旧数据归属 default 账号，不丢失')
  assert.equal(getChatHistory('alice').length, 0, '其他账号看不到旧数据')

  // 新写入走账号映射，旧数组被替换
  saveChatHistoryEntry('alice', '新消息', { content: '新回复', resources: [], suggestions: [] }, [])
  assert.equal(getChatHistory('alice').length, 2)
  assert.equal(getChatHistory('default').length, 2, 'default 账号旧数据保留')
})

test('知识路径按账号隔离且旧格式迁移为 default', () => {
  resetStore()
  saveKnowledgePathResult('alice', { phases: [{ name: 'alice 的阶段' }] })
  saveKnowledgePathResult('bob', { phases: [{ name: 'bob 的阶段' }] })

  assert.deepEqual(getLatestKnowledgePath('alice'), { phases: [{ name: 'alice 的阶段' }] })
  assert.deepEqual(getLatestKnowledgePath('bob'), { phases: [{ name: 'bob 的阶段' }] })
  assert.equal(getLatestKnowledgePath('carol'), null)

  resetStore()
  // 旧格式：单份全局 knowledgePathResult
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    knowledgePathResult: { phases: [{ name: '改造前的全局路径' }] },
  }), 'utf8')
  assert.deepEqual(getLatestKnowledgePath('default'), { phases: [{ name: '改造前的全局路径' }] }, '旧路径迁移到 default')
  assert.equal(getLatestKnowledgePath('alice'), null, '其他账号看不到旧全局路径')
})

test('协作看板聚合不泄露 trace 中的用户内容', async () => {
  const { buildCollaborationFromTraces } = await import('./collaboration-sync.js')
  const marker = '用户私密对话内容标记'
  const now = new Date()
  // 构造一个周四（工作日 9-18 点窗口内）的 trace，确保能进入协作聚合
  const thursday = new Date(now)
  thursday.setDate(now.getDate() + ((4 - now.getDay() + 7) % 7 || 7))
  thursday.setHours(10, 30, 0, 0)

  const collaboration = buildCollaborationFromTraces([{
    requestId: 'req-1',
    timestamp: thursday.toISOString(),
    agents: ['TutorAgent'],
    inputsSummary: marker,
    outputsSummary: marker,
    evidence: [], riskFlags: [], fallbackUsed: false, durationMs: 10, agentResults: [],
  }])

  assert.notEqual(collaboration, null, '有 trace 时应产出协作数据')
  const serialized = JSON.stringify(collaboration)
  assert.ok(!serialized.includes(marker), '协作看板数据不得包含 trace 里的用户内容')
})
