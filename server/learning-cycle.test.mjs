import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyProfileUpdates } from './learning-cycle.js'

const profile = {
  dimensions: [
    { label: '知识基础', value: 60 },
    { label: '逻辑思维', value: 70 },
  ],
  radarPoints: [
    { dimension: '知识基础', score: 60 },
    { dimension: '逻辑思维', score: 70 },
  ],
  totalScore: 65,
}

test('profile write-back changes only the evidenced dimension and stays bounded', () => {
  const result = applyProfileUpdates(profile, {
    profileUpdates: {
      adjustDimensions: [{ dimension: '知识基础', delta: -5, reason: 'BFS 测评正确率 40%' }],
    },
  })

  assert.equal(result.profile.dimensions[0].value, 55)
  assert.equal(result.profile.dimensions[1].value, 70)
  assert.equal(result.profile.radarPoints[0].score, 55)
  assert.deepEqual(result.changes[0], {
    dimension: '知识基础', before: 60, delta: -5, after: 55, reason: 'BFS 测评正确率 40%',
  })
})

test('profile write-back supports evidence-backed improvement', () => {
  const result = applyProfileUpdates({
    ...profile,
    dimensions: [{ label: '知识基础', value: 68 }, profile.dimensions[1]],
    radarPoints: [{ dimension: '知识基础', score: 68 }, profile.radarPoints[1]],
    weaknesses: ['知识基础薄弱', '逻辑思维需巩固'],
  }, {
    profileUpdates: {
      adjustDimensions: [{ dimension: '知识基础', delta: 4, reason: '连续两轮正确率达到 90%' }],
    },
  })

  assert.equal(result.profile.dimensions[0].value, 72)
  assert.equal(result.profile.dimensions[1].value, 70)
  assert.deepEqual(result.profile.weaknesses, ['逻辑思维需巩固'])
})
