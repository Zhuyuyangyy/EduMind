import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('profile persistence falls back to JSON when MySQL is not configured', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zhixue-storage-'))
  const previousDataFile = process.env.ZHIXUE_DATA_FILE
  const previousMySqlUrl = process.env.MYSQL_URL
  const previousMySqlHost = process.env.MYSQL_HOST
  const previousMySqlUser = process.env.MYSQL_USER
  const previousMySqlDatabase = process.env.MYSQL_DATABASE

  process.env.ZHIXUE_DATA_FILE = path.join(directory, 'store.json')
  delete process.env.MYSQL_URL
  delete process.env.MYSQL_HOST
  delete process.env.MYSQL_USER
  delete process.env.MYSQL_DATABASE

  try {
    const { getProfileResult, saveProfileResult } = await import('./store/mysql.js')
    const saved = await saveProfileResult('student-1', { totalScore: 73 })
    const loaded = await getProfileResult('student-1')

    assert.equal(saved.accountId, 'student-1')
    assert.equal(loaded.totalScore, 73)
    assert.equal(loaded.accountId, 'student-1')
  } finally {
    if (previousDataFile === undefined) delete process.env.ZHIXUE_DATA_FILE
    else process.env.ZHIXUE_DATA_FILE = previousDataFile
    if (previousMySqlUrl === undefined) delete process.env.MYSQL_URL
    else process.env.MYSQL_URL = previousMySqlUrl
    if (previousMySqlHost === undefined) delete process.env.MYSQL_HOST
    else process.env.MYSQL_HOST = previousMySqlHost
    if (previousMySqlUser === undefined) delete process.env.MYSQL_USER
    else process.env.MYSQL_USER = previousMySqlUser
    if (previousMySqlDatabase === undefined) delete process.env.MYSQL_DATABASE
    else process.env.MYSQL_DATABASE = previousMySqlDatabase
    await rm(directory, { recursive: true, force: true })
  }
})
