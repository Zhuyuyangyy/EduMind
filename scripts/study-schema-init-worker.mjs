// Separate process used by the real-MySQL schema initialization regression.
import { getMySqlPool, closeMySqlPool } from '../server/store/mysql.js'
import { ensureStudySchema } from '../server/study/store-mysql.js'

let indexAlters = 0
function observe(target) {
  const query = target.query.bind(target)
  target.query = (...args) => {
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.sql || ''
    if (/ALTER\s+TABLE\s+answer_submissions\s+(DROP\s+INDEX|ADD\s+UNIQUE)/i.test(sql)) indexAlters++
    return query(...args)
  }
}
const pool = getMySqlPool()
observe(pool)
const getConnection = pool.getConnection.bind(pool)
pool.getConnection = async () => {
  const connection = await getConnection()
  observe(connection)
  return connection
}
console.log('ready')
process.stdin.once('data', async () => {
  try {
    await Promise.all([ensureStudySchema(), ensureStudySchema()])
    console.log(JSON.stringify({ ok: true, indexAlters }))
  } catch (error) {
    console.log(JSON.stringify({ ok: false, indexAlters, code: error.code, message: error.message }))
    process.exitCode = 1
  } finally {
    await closeMySqlPool()
    process.stdin.destroy()
  }
})
