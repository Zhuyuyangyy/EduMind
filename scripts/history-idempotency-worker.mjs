/**
 * P4-2B-3b 并发幂等 worker：以独立进程执行一次 appendChatInteraction，
 * 供父进程构造「两个进程同账号同幂等键精确并发」场景。
 *
 * 用法：node scripts/history-idempotency-worker.mjs --account <id> --key <key>
 *         [--message <text>] [--content <text>] --out <file>
 */

import fs from 'node:fs'
import process from 'node:process'

const args = process.argv.slice(2)
function argOf(name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

const account = argOf('--account')
const key = argOf('--key')
const message = argOf('--message') || '并发问题'
const content = argOf('--content') || '并发回复'
const outFile = argOf('--out')

const repository = await import('../server/study/repository.js')

async function main() {
  try {
    const result = await repository.appendChatInteraction(account, {
      userMessage: message,
      reply: { content, resources: [], suggestions: [] },
      idempotencyKey: key,
    })
    fs.writeFileSync(outFile, JSON.stringify({ ok: true, ...result }), 'utf8')
  } catch (error) {
    fs.writeFileSync(outFile, JSON.stringify({
      ok: false,
      statusCode: error?.statusCode || null,
      message: error?.message || String(error),
      code: error?.code || null,
    }), 'utf8')
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
