/**
 * 服务端确定性判分（P3-1 · feat/mobile-v1）
 * 规则：客户端只能提交答案，不能提交正确率/标准答案/分数；
 * 对错由服务端对照题库答案计算，可复现、可审计。
 */

/** 选择题：提交选项下标（数字），与服务端答案严格相等 */
export function scoreChoice(submitted, correctIndex) {
  const index = Number(submitted)
  if (!Number.isInteger(index) || index < 0) {
    return { correct: false, reason: '答案格式不合法（应为非负整数选项下标）' }
  }
  if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0) {
    return { correct: false, reason: '题库答案配置异常' }
  }
  return { correct: index === correctIndex, reason: index === correctIndex ? '回答正确' : '回答错误' }
}

/** 评分入口：按题目类型分派；未知类型一律判错并记录原因（不静默放过） */
export function scoreAnswer(exercise, submitted) {
  if (!exercise || typeof exercise !== 'object') {
    return { correct: false, reason: '题目不存在' }
  }
  if (exercise.type === 'choice') {
    return scoreChoice(submitted, exercise.answer)
  }
  return { correct: false, reason: `暂不支持的题型: ${exercise.type}` }
}

/** 汇总一次练习会话的评分事实（确定性计算，无任何模型参与） */
export function summarizeAttempts(attempts) {
  const total = attempts.length
  const correct = attempts.filter(a => a.correct).length
  return {
    total,
    correct,
    correctRate: total === 0 ? null : Number((correct / total).toFixed(4)),
  }
}
