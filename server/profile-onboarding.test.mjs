import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'
import { runProfileAgent } from './agents/profile-agent.js'

test('zero self-assessment remains zero in rule analysis', async () => {
  const result = await runProfileAgent({ level: 'beginner', knowledgeBase: 0, learningSpeed: 0, logicalThinking: 0, creativity: 0, focus: 0, selfDiscipline: 0 })
  if (!result.fallbackUsed) return
  const points = Object.fromEntries(result.output.radarPoints.map(point => [point.dimension, point.score]))
  assert.equal(points['知识基础'], 0)
  assert.equal(points['逻辑思维'], 0)
  assert.equal(points['创造力'], 0)
})

test('questionnaire needs and provenance persist per account across a new login', async () => {
  await withTestServer(async ({ post, get }) => {
    const signIn = async (account, password) => {
      const response = await post('/api/auth/login', { account, password, role: 'student' })
      assert.equal(response.status, 200)
      return { Authorization: `Bearer ${(await response.json()).token}` }
    }
    const headers = await signIn('reviewer', 'Zhixue2026!')
    const answers = { role: 'student', field: 'ai', level: 'beginner', experience: 'less-than-1', shortTermGoal: 'project', shortTermDetail: '独立完成一个图像分类项目', longTermGoal: 'skill-up', motivation: 'interest', weeklyHours: '5-10', resourcePreference: 'practice', learningPace: 'steady', bestTime: 'evening', knowledgeBase: 0, learningSpeed: 50, logicalThinking: 45, creativity: 60, focus: 65, selfDiscipline: 55 }
    const analyzed = await post('/api/agents/profile', { ...answers, accountId: 'student', source: 'fake-real-score' }, { headers })
    assert.equal(analyzed.status, 200)
    const result = await analyzed.json()
    assert.equal(result.profile.source, 'questionnaire')
    assert.equal(result.profile.analysisSource, result.trace.fallbackUsed ? 'rule' : 'model')
    assert.equal(result.profile.learnerNeeds.knowledgeBase, 0)
    assert.equal(result.profile.learnerNeeds.shortTermDetail, answers.shortTermDetail)
    assert.equal(result.profile.learnerNeeds.accountId, undefined)
    const other = await signIn('student', 'student123')
    assert.equal((await (await get('/api/profile/latest', { headers: other })).json()).result, null)
    await post('/api/auth/logout', {}, { headers })
    const restored = await signIn('reviewer', 'Zhixue2026!')
    const saved = (await (await get('/api/profile/latest', { headers: restored })).json()).result
    assert.deepEqual(saved.learnerNeeds, result.profile.learnerNeeds)
    assert.equal(saved.analysisSource, result.profile.analysisSource)
    const path = await post('/api/knowledge-path/generate', {}, { headers: restored })
    assert.equal(path.status, 200)
    assert.ok((await path.json()).phases.length > 0)
    assert.equal((await (await get('/api/knowledge-path/latest', { headers: other })).json()).result, null)
  })
})
