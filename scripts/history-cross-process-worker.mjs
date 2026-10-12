/**
 * P4-2B-3 跨进程 worker：以独立 Node 进程向共享 MySQL 写入聊天交互，
 * 供父进程验证「A 进程写、B 进程按原顺序读」。
 *
 * 用法：node scripts/history-cross-process-worker.mjs --account <id> --out <file>
 */

import fs from 'node:fs'
import process from 'node:process'

const args = process.argv.slice(2)
function argOf(name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

const account = argOf('--account')
const outFile = argOf('--out')

const repository = await import('../server/study/repository.js')

async function main() {
  await repository.appendChatInteraction(account, {
    userMessage: '跨进程问题一',
    reply: { content: '跨进程回复一', resources: [], suggestions: [] },
  })
  await repository.appendChatInteraction(account, {
    userMessage: '跨进程问题二',
    reply: { content: '跨进程回复二', resources: [], suggestions: [] },
  })
  const items = await repository.getChatHistory(account)
  fs.writeFileSync(outFile, JSON.stringify({ written: items.length, roles: items.map(i => i.role) }), 'utf8')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
