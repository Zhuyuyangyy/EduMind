import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchKnowledgeBase } from './vector-store.js'

test('hybrid retrieval exposes weighted component scores and routes BFS evidence', () => {
  const result = searchKnowledgeBase({ query: 'BFS visited queue 标记时机', limit: 3, mode: 'hybrid' })

  assert.equal(result.matches[0].id, 'kb-eval-bfs-visited')
  assert.equal(result.matches[0].domain, 'graph-algorithms')
  assert.deepEqual(result.retrieval.weights, { vector: 0.5, tag: 0.3, keyword: 0.2 })
  assert.equal(result.retrieval.mode, 'hybrid')
  assert.equal(typeof result.matches[0].scores.vector, 'number')
  assert.equal(typeof result.matches[0].scores.tag, 'number')
  assert.equal(typeof result.matches[0].scores.keyword, 'number')
  assert.equal(result.outOfKnowledgeBase, false)
})

test('retrieval modes support ablation and mark unrelated questions out of knowledge base', () => {
  for (const mode of ['keyword', 'vector', 'vector-keyword', 'hybrid']) {
    const result = searchKnowledgeBase({ query: 'pointer aliasing memory address', mode, limit: 1 })
    assert.equal(result.retrieval.mode, mode)
    assert.equal(result.matches[0].id, 'kb-eval-pointer-aliasing')
  }

  const unrelated = searchKnowledgeBase({ query: '今天上海的天气和机票价格怎么样？', mode: 'hybrid' })
  assert.equal(unrelated.outOfKnowledgeBase, true)
})
