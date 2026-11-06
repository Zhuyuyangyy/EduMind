import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerQuestion, coveredTopics, suggestedQuestions, tokenize } from '../src/logic/tutor.ts'

test('分词：中文二元滑窗 + 英文数字词', () => {
  const tokens = tokenize('NumPy 的广播 broadcast 是什么？')
  assert.ok(tokens.includes('广播'))
  assert.ok(tokens.includes('numpy'))
  assert.ok(tokens.includes('broadcast'))
})

test('命中知识库：返回讲解、示例、引用依据与相关练习', () => {
  const response = answerQuestion('NumPy 的广播是什么意思？')
  assert.equal(response.mode, 'demo')
  assert.equal(response.matched, true)
  assert.equal(response.kpId, 'numpy-basics')
  assert.match(response.answer, /广播/)
  assert.ok(response.example && response.example.includes('broadcast') === false)
  assert.ok(response.source?.includes('课程讲义'))
  assert.ok(response.relatedExercises.length > 0)
  assert.ok(response.matchedTerms.length > 0)
})

test('薄弱知识点相关问题命中对应课程卡片', () => {
  assert.equal(answerQuestion('缺失值应该删除还是填充？').kpId, 'pandas-clean')
  assert.equal(answerQuestion('loc 和 iloc 的区别').kpId, 'pandas-select')
  assert.equal(answerQuestion('merge 后行数变多怎么办').kpId, 'merge-concat')
  assert.equal(answerQuestion('中文乱码怎么解决').kpId, 'viz-basic')
  assert.equal(answerQuestion('groupby 的执行过程是什么').kpId, 'groupby-agg')
})

test('未命中：明确降级并列出可问范围，不编造答案', () => {
  const response = answerQuestion('明天北京的天气怎么样')
  assert.equal(response.matched, false)
  assert.equal(response.source, null)
  assert.match(response.answer, /超出.*覆盖范围|演示模式/)
})

test('空输入与客套话的处理', () => {
  assert.equal(answerQuestion('   ').matched, false)
  const hello = answerQuestion('你好')
  assert.equal(hello.matched, false)
  assert.match(hello.answer, /演示/)
})

test('推荐问题：针对薄弱知识点生成且非空', () => {
  const questions = suggestedQuestions(['pandas-clean', 'groupby-agg'])
  assert.ok(questions.length >= 2)
  assert.equal(suggestedQuestions([]).length >= 3, true)
})

test('覆盖范围包含全部 8 个知识点', () => {
  assert.equal(coveredTopics().length, 8)
})
