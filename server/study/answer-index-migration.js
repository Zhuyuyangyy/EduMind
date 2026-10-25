const INDEX_NAME = 'answer_submissions_idem'
const TARGET_COLUMNS = ['account_id', 'session_id', 'idempotency_key']

function matches(rows, columns) {
  return rows.length === columns.length && rows.every((row, i) =>
    row.COLUMN_NAME === columns[i] && Number(row.NON_UNIQUE) === 0 && row.SUB_PART == null)
}

/** Migrate only the known legacy index; never remove a correct/unknown index. */
export async function ensureAnswerIdempotencyIndex(pool) {
  const connection = await pool.getConnection()
  let locked = false
  try {
    // GET_LOCK is scoped to this physical connection, not a pooled query.
    // Hashing the schema keeps the name below MySQL's 64-character limit.
    const [[row]] = await connection.query("SELECT GET_LOCK(CONCAT('edumind:answer-idem:', MD5(DATABASE())), 30) AS acquired")
    if (Number(row.acquired) !== 1) {
      throw Object.assign(new Error('Timed out waiting for study index migration'), { code: 'STUDY_INDEX_LOCK_TIMEOUT' })
    }
    locked = true
    const [indexes] = await connection.query(
      `SELECT COLUMN_NAME, NON_UNIQUE, SUB_PART FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answer_submissions' AND INDEX_NAME = ?
       ORDER BY SEQ_IN_INDEX`, [INDEX_NAME],
    )
    if (matches(indexes, TARGET_COLUMNS)) return
    if (indexes.length === 0) {
      await connection.query('ALTER TABLE answer_submissions ADD UNIQUE KEY answer_submissions_idem (account_id, session_id, idempotency_key)')
    } else if (matches(indexes, ['idempotency_key'])) {
      // One atomic MySQL 8 DDL statement: no committed state without the index.
      await connection.query(`ALTER TABLE answer_submissions
        DROP INDEX answer_submissions_idem,
        ADD UNIQUE KEY answer_submissions_idem (account_id, session_id, idempotency_key)`)
    } else {
      throw Object.assign(new Error('Unexpected answer_submissions_idem definition; manual schema review required'), { code: 'STUDY_INDEX_SCHEMA_MISMATCH' })
    }
  } finally {
    try {
      if (locked) {
        const [[row]] = await connection.query("SELECT RELEASE_LOCK(CONCAT('edumind:answer-idem:', MD5(DATABASE()))) AS released")
        if (Number(row.released) !== 1) connection.destroy()
      }
    } catch {
      // Never return a connection with an unreleased advisory lock to the pool.
      connection.destroy()
    } finally {
      connection.release()
    }
  }
}
