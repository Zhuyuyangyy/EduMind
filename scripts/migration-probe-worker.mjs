/**
 * P4-2B-4 fail-closed 探针 worker：以全新进程（启动环境变量为准）
 * 执行一次迁移，输出 RESULT:<json> 到 stdout。
 * 用于验证数据库不可达时明确失败（模块级连接池缓存使同进程 env
 * 覆盖无效，必须全新进程才真实）。
 *
 * 用法：node scripts/migration-probe-worker.mjs --source <path> --mode <mode>
 */

import process from 'node:process'

const args = process.argv.slice(2)
function argOf(name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

const source = argOf('--source')
const mode = argOf('--mode') || 'import'

const migrator = await import('../scripts/migrate-legacy-json.mjs')

async function main() {
  const result = await migrator.runMigration({ mode, sourcePath: source, env: process.env })
  console.log(`RESULT:${JSON.stringify({ ok: result.ok, errors: result.errors || [] })}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.log(`RESULT:${JSON.stringify({ ok: false, errors: [error?.message || String(error)] })}`)
    process.exit(0)
  })
