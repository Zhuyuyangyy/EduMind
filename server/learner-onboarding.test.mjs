import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'
import { normalizeOnboarding } from './learner-onboarding.js'
const answers = { role: 'student', field: 'cs', level: 'beginner', shortTermGoal: 'project', weeklyHours: '5-10', resourcePreference: 'practice', shortTermDetail: '完成第一个 Python 项目' }
test('welcome intake validates completed choices without generating ability scores', () => {
  assert.equal(normalizeOnboarding({ status: 'completed', answers: {} }), null)
  assert.equal(normalizeOnboarding({ status: 'completed', answers: { ...answers, field: 'invalid' } }), null)
  assert.equal(normalizeOnboarding({ status: 'completed', answers: { ...answers, field: 'other' } }), null)
  const result = normalizeOnboarding({ status: 'completed', answers: { ...answers, totalScore: 100, accountId: 'other' } })
  assert.equal(result.answers.totalScore, undefined)
  assert.equal(result.answers.accountId, undefined)
  assert.equal(result.version, 1)
  assert.ok(normalizeOnboarding({ status: 'skipped', answers: {} }))
})
test('welcome preferences persist per server account and never overwrite an existing profile', async () => {
  await withTestServer(async ({ post, get }) => {
    const login = async (account, password) => ({ Authorization: `Bearer ${(await (await post('/api/auth/login', { account, password, role: 'student' })).json()).token}` })
    const a = await login('reviewer', 'Zhixue2026!'), b = await login('student', 'student123')
    assert.equal((await get('/api/account/onboarding')).status, 401)
    const profile = { dimensions: [{ label: '知识基础', value: 77 }], totalScore: 77, source: 'test-fixture' }
    await post('/api/profile/save', profile, { headers: a })
    assert.equal((await post('/api/account/onboarding', { status: 'completed', answers: {} }, { headers: a })).status, 400)
    assert.equal((await post('/api/account/onboarding', { status: 'completed', accountId: 'student', answers }, { headers: a })).status, 200)
    assert.equal((await (await get('/api/account/onboarding', { headers: b })).json()).result, null)
    assert.equal((await (await get('/api/profile/latest', { headers: a })).json()).result.totalScore, 77)
    const again = await login('reviewer', 'Zhixue2026!')
    assert.deepEqual((await (await get('/api/account/onboarding', { headers: again })).json()).result.answers, answers)
    await post('/api/account/onboarding', { status: 'skipped', answers: { field: 'ai' } }, { headers: b })
    assert.equal((await (await get('/api/account/onboarding', { headers: b })).json()).result.status, 'skipped')
  })
})
const mysqlConfigured = Boolean(process.env.MYSQL_URL || process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE)
test('MySQL welcome records round trip independently for two accounts', { skip: mysqlConfigured ? false : 'MySQL environment not configured' }, async () => {
  const store = await import('./store/mysql.js')
  const a = `welcome-test-${process.pid}-a`, b = `welcome-test-${process.pid}-b`
  try {
    const record = normalizeOnboarding({ status: 'completed', answers })
    await store.saveLearnerOnboarding(a, record)
    assert.deepEqual(await store.getLearnerOnboarding(a), record)
    assert.equal(await store.getLearnerOnboarding(b), null)
    const skipped = normalizeOnboarding({ status: 'skipped', answers: {} })
    await store.saveLearnerOnboarding(b, skipped)
    assert.equal((await store.getLearnerOnboarding(b)).status, 'skipped')
    assert.equal((await store.getLearnerOnboarding(a)).status, 'completed')
  } finally { await store.closeMySqlPool() }
})
