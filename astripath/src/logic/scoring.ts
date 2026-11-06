/**
 * 确定性判分（移植自原智学星枢工程 server/study/scoring.js 的规则）
 * 规则：只依据「题目 + 选项下标」判分，可复现、可审计；未知题型一律判错并记录原因。
 */
import type { DiagnosisQuestion, Exercise } from './types.ts'

export interface ScoreResult {
  correct: boolean
  reason: string
}

/** 选择题：提交选项下标（数字），与正确答案严格相等 */
export function scoreChoice(submitted: unknown, correctIndex: number): ScoreResult {
  const index = Number(submitted)
  if (!Number.isInteger(index) || index < 0) {
    return { correct: false, reason: '答案格式不合法（应为非负整数选项下标）' }
  }
  if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0) {
    return { correct: false, reason: '题库答案配置异常' }
  }
  return { correct: index === correctIndex, reason: index === correctIndex ? '回答正确' : '回答错误' }
}

/** 评分入口：按题目类型分派；未知类型一律判错（不静默放过） */
export function scoreAnswer(
  question: DiagnosisQuestion | Exercise,
  submitted: unknown
): ScoreResult {
  if (!question || typeof question !== 'object') {
    return { correct: false, reason: '题目不存在' }
  }
  if ('choices' in question && 'answer' in question) {
    return scoreChoice(submitted, question.answer)
  }
  return { correct: false, reason: `暂不支持的题型: ${String((question as { type?: string }).type)}` }
}

/** 汇总一次作答会话的评分事实（确定性计算，无任何模型参与） */
export function summarizeAttempts(attempts: Array<{ correct: boolean }>) {
  const total = attempts.length
  const correct = attempts.filter((a) => a.correct).length
  return {
    total,
    correct,
    correctRate: total === 0 ? null : Number((correct / total).toFixed(4))
  }
}
