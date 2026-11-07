import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const view = fs.readFileSync(path.join(root, 'src/views/Evaluation.vue'), 'utf8')
const composable = fs.readFileSync(path.join(root, 'src/composables/useEvaluationTreeData.ts'), 'utf8')

test('Evaluation view exposes unavailable/no-data states and has no silent mock fallback', () => {
  assert.match(view, /status === 'unavailable'/)
  assert.match(view, /status === 'no-data'/)
  assert.match(view, /暂无真实测评数据/)
  assert.doesNotMatch(view, /BASE_KNOWLEDGE_ITEMS/)
  assert.doesNotMatch(view, /applyProgressToMastery\(/)
  assert.doesNotMatch(composable, /catch\s*\([^)]*\)\s*\{[\s\S]{0,200}createMockData\(\)/)
})
