import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { getMySqlPool, closeMySqlPool, isMySqlConfigured } from './store/mysql.js'
import { appendChatInteraction, ensureHistorySchema, getChatHistory } from './study/history-repository.js'

const options = { skip: isMySqlConfigured() ? false : '未配置 MySQL：聊天事务死锁回滚和有限重试未实测' }
after(closeMySqlPool)

async function withDeadlocks(failures, run) {
  await ensureHistorySchema()
  const pool = getMySqlPool()
  const original = pool.getConnection
  let injected = 0
  pool.getConnection = async function () {
    const connection = await original.call(this)
    const query = connection.query.bind(connection)
    connection.query = async (...args) => {
      // Inject a server-side MySQL 1213 after the user INSERT, exercising
      // rollback of a partially written interaction, not a mocked success.
      if (injected < failures && /INSERT INTO chat_messages/.test(args[0]) && /'assistant'/.test(args[0])) {
        injected++
        return query("SIGNAL SQLSTATE '40001' SET MYSQL_ERRNO = 1213, MESSAGE_TEXT = 'deadlock regression'")
      }
      return query(...args)
    }
    return connection
  }
  try { await run(() => injected) } finally { pool.getConnection = original }
}

test('MySQL 聊天死锁：部分写入回滚后有限重试，消息仍只落一对', options, async () => {
  const account = `deadlock-${randomUUID()}`
  try {
    await withDeadlocks(2, async count => {
      const result = await appendChatInteraction(account, { userMessage: 'question', reply: { content: 'answer' }, idempotencyKey: 'deadlock-key' })
      assert.equal(count(), 2)
      assert.equal(result.duplicate, false)
      const items = await getChatHistory(account)
      assert.deepEqual(items.map(item => item.role), ['user', 'assistant'])
      assert.deepEqual(items.map(item => item.content), ['question', 'answer'])
      const duplicate = await appendChatInteraction(account, { userMessage: 'question', reply: { content: 'another answer' }, idempotencyKey: 'deadlock-key' })
      assert.equal(duplicate.duplicate, true)
      assert.equal(duplicate.reply.content, 'answer')
    })
  } finally { await getMySqlPool().query('DELETE FROM chat_messages WHERE account_id = ?', [account]) }
})

test('MySQL 聊天死锁：持续失败最多三次事务，明确报错且不残留用户行', options, async () => {
  const account = `deadlock-limit-${randomUUID()}`
  try {
    await withDeadlocks(Infinity, async count => {
      await assert.rejects(appendChatInteraction(account, { userMessage: 'question', reply: { content: 'answer' }, idempotencyKey: 'deadlock-key' }), { code: 'ER_LOCK_DEADLOCK' })
      assert.equal(count(), 3)
      assert.deepEqual(await getChatHistory(account), [])
    })
  } finally { await getMySqlPool().query('DELETE FROM chat_messages WHERE account_id = ?', [account]) }
})
