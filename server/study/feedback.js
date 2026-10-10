/**
 * 练习反馈生成（P3-2 · feat/mobile-v1）
 *
 * 铁律：反馈与判分完全隔离——LLM 成功/失败/降级都不改变真实评分；
 * 反馈只做解释与建议。LLM 不可用时降级为确定性模板，内容同样引用
 * 真实作答数据，不虚构。
 */
import { callLlm, isLlmAvailable } from '../llm/provider.js'

const SYSTEM_PROMPT = `你是智学星枢的 AI 学习导师。学生刚完成一次真实练习，你会收到：
- 练习统计（作答题数、正确数、正确率，均为服务端判分结果）；
- 错题列表（题目、学生的错误选项、正确选项、解析要点）。

请输出一段 120-220 字的中文反馈，要求：
1. 先肯定具体做对了什么（引用真实数据）；
2. 指出错题对应的知识点，解释为什么错（通俗、启发式，不要直接批评）；
3. 给出 1-2 条可执行的下一步学习建议；
4. 语气鼓励、具体；不得编造题目或数据中不存在的细节。`

function ruleBasedFeedback({ assessment, wrongItems }) {
  const { total, correct, correctRate } = assessment
  const rate = correctRate == null ? 0 : Math.round(correctRate * 100)
  const parts = []

  if (total === 0) {
    return '本次练习没有作答记录，先从一道题开始，我们循序渐进。'
  }
  if (correct === total) {
    parts.push(`本轮 ${total} 题全部正确（正确率 ${rate}%），说明这些知识点已经掌握得比较扎实。`)
  } else {
    parts.push(`本轮共 ${total} 题，你做对了 ${correct} 题（正确率 ${rate}%）。`)
  }

  if (wrongItems.length > 0) {
    const points = [...new Set(wrongItems.map(item => item.knowledgePoint).filter(Boolean))]
    parts.push(`需要关注的知识点：${points.join('、')}。`)
    const first = wrongItems[0]
    if (first?.explanation) {
      parts.push(`以「${first.knowledgePoint}」为例：${first.explanation}`)
    }
    parts.push('建议把错题对应的知识点重看一遍，再来一组练习检验。')
  } else {
    parts.push('可以尝试提高难度的练习，或进入下一个知识点。')
  }
  return parts.join('')
}

/**
 * 生成反馈。返回 { source: 'model'|'rule', text, degraded, error }。
 * 任何 LLM 故障都降级为规则反馈，绝不抛出、绝不伪造。
 */
export async function generateStudyFeedback({ assessment, wrongItems }) {
  const safeAssessment = {
    total: Number(assessment?.total) || 0,
    correct: Number(assessment?.correct) || 0,
    correctRate: assessment?.correctRate ?? null,
  }
  const safeWrong = Array.isArray(wrongItems) ? wrongItems : []

  if (!isLlmAvailable()) {
    return { source: 'rule', text: ruleBasedFeedback({ assessment: safeAssessment, wrongItems: safeWrong }), degraded: true, error: null }
  }

  const userPrompt = JSON.stringify({
    assessment: safeAssessment,
    wrongItems: safeWrong.map(item => ({
      knowledgePoint: item.knowledgePoint,
      prompt: item.prompt,
      wrongChoice: item.wrongChoice ?? null,
      correctChoice: item.correctChoice ?? null,
      explanation: item.explanation ?? '',
    })),
  })

  try {
    const result = await callLlm(SYSTEM_PROMPT, userPrompt, { temperature: 0.5, maxTokens: 512 })
    if (result.fallbackUsed || !result.content) {
      return {
        source: 'rule',
        text: ruleBasedFeedback({ assessment: safeAssessment, wrongItems: safeWrong }),
        degraded: true,
        error: result.error || 'LLM 无内容返回',
      }
    }
    return { source: 'model', text: result.content.trim(), degraded: false, error: null }
  } catch (error) {
    return {
      source: 'rule',
      text: ruleBasedFeedback({ assessment: safeAssessment, wrongItems: safeWrong }),
      degraded: true,
      error: error?.message || 'LLM 调用异常',
    }
  }
}

/** 组装错题条目（引用题库解析 + 学生实际提交，供反馈与 UI 使用） */
export function buildWrongItems(attempts, findExercise) {
  return attempts
    .filter(attempt => !attempt.correct)
    .map(attempt => {
      const exercise = findExercise(attempt.exerciseId)
      const submitted = attempt.submitted
      const wrongChoice = exercise?.type === 'choice' && Number.isInteger(Number(submitted))
        ? (exercise.choices?.[Number(submitted)] ?? null)
        : (typeof submitted === 'string' ? submitted : null)
      const correctChoice = exercise?.type === 'choice' && Number.isInteger(exercise.answer)
        ? (exercise.choices?.[exercise.answer] ?? null)
        : null
      return {
        exerciseId: attempt.exerciseId,
        knowledgePoint: exercise?.knowledgePoint || attempt.exerciseId,
        prompt: exercise?.prompt || '',
        explanation: exercise?.explanation || '',
        wrongChoice,
        correctChoice,
      }
    })
}
