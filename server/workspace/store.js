import fs from 'node:fs'
import path from 'node:path'
import { getMySqlPool, isMySqlConfigured } from '../store/mysql.js'

let schema
const initial = () => ({ version: 0, goals: [], materials: [], notes: [], tasks: [], memories: [], focus: [], reviews: [], feedback: [], preferences: { memoryEnabled: true, reminderEnabled: false, reminderTime: '18:00', quietStart: '22:00', quietEnd: '08:00' } })
const normalize = value => ({ ...initial(), ...value, preferences: { ...initial().preferences, ...value?.preferences } })
const file = () => process.env.ZHIXUE_DATA_FILE || path.resolve('server/store.json')
async function ensureSchema() {
  if (!schema) schema = getMySqlPool().query(`CREATE TABLE IF NOT EXISTS learner_workspaces (account_id VARCHAR(191) PRIMARY KEY, payload_json JSON NOT NULL, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => { schema = null; throw error })
  await schema
}
export async function getWorkspace(account) {
  if (isMySqlConfigured()) {
    await ensureSchema()
    const [rows] = await getMySqlPool().query('SELECT payload_json FROM learner_workspaces WHERE account_id=?', [account])
    return normalize(rows[0] ? typeof rows[0].payload_json === 'string' ? JSON.parse(rows[0].payload_json) : rows[0].payload_json : null)
  }
  const full = fs.existsSync(file()) ? JSON.parse(fs.readFileSync(file(), 'utf8')) : {}
  return normalize(full.learnerWorkspaces?.[account])
}
export async function mutateWorkspace(account, update) {
  if (isMySqlConfigured()) {
    await ensureSchema()
    const db = await getMySqlPool().getConnection()
    try {
      await db.beginTransaction()
      // Acquire the exclusive row lock at the upsert. INSERT IGNORE would hold
      // shared duplicate-key locks that deadlock when concurrent writers upgrade.
      await db.query('INSERT INTO learner_workspaces(account_id,payload_json) VALUES (?,?) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id)', [account, JSON.stringify(initial())])
      const [rows] = await db.query('SELECT payload_json FROM learner_workspaces WHERE account_id=? FOR UPDATE', [account])
      const state = normalize(typeof rows[0].payload_json === 'string' ? JSON.parse(rows[0].payload_json) : rows[0].payload_json)
      const result = update(state)
      state.version++
      await db.query('UPDATE learner_workspaces SET payload_json=? WHERE account_id=?', [JSON.stringify(state), account])
      await db.commit()
      return result
    } catch (error) { await db.rollback(); throw error } finally { db.release() }
  }
  // No await between the read and atomic rename: preserve other JSON store domains.
  const filename = file()
  const full = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {}
  full.learnerWorkspaces ||= {}
  const state = normalize(full.learnerWorkspaces[account])
  const result = update(state)
  state.version++
  full.learnerWorkspaces[account] = state
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${process.pid}.workspace.tmp`
  fs.writeFileSync(temporary, JSON.stringify(full), 'utf8')
  fs.renameSync(temporary, filename)
  return result
}
