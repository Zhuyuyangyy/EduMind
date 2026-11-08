/**
 * 竞赛闭环视图共享：演示知识点状态 → 原版 3D 知识树数据契约
 */
import type { KnowledgePoint, MasteryRange, AgentEvidence } from '../types/knowledge-tree'
import { demoCourse, getDemoState } from './demoState'

export function masteryRange(mastery: number, tested: boolean): MasteryRange {
  if (!tested) return 'none'
  if (mastery >= 80) return 'mastered'
  if (mastery >= 60) return 'proficient'
  if (mastery >= 40) return 'basic'
  if (mastery >= 20) return 'beginner'
  return 'weak'
}

const STATUS_LABEL: Record<MasteryRange, string> = {
  none: '未测试',
  weak: '薄弱',
  beginner: '入门',
  basic: '基础',
  proficient: '熟练',
  mastered: '已掌握'
}

export { STATUS_LABEL }

/** 演示知识点 → 知识树节点（progress/course 为 3D 树组件契约字段） */
export function toTreePoints(): (KnowledgePoint & { progress: number; course: string })[] {
  const state = getDemoState()
  return demoCourse.knowledgePoints.map((kp) => {
    const kpState = state.kpStates[kp.id]
    const tested = kpState.diagnosis !== null || kpState.practiceCount > 0
    const mastery = tested ? Math.round(kpState.mastery) : 0
    const evidence: AgentEvidence[] = []
    if (kpState.diagnosis) {
      evidence.push({
        agentType: 'evaluation',
        agentName: '学情诊断',
        evidenceType: 'assessment',
        count: kpState.diagnosis.total,
        samples: [`诊断 ${kpState.diagnosis.correct}/${kpState.diagnosis.total} 正确`]
      })
    }
    if (kpState.practiceCount > 0) {
      evidence.push({
        agentType: 'action',
        agentName: '针对性练习',
        evidenceType: 'task_result',
        count: kpState.practiceCount,
        samples: [`练习累计 ${kpState.practiceCorrect}/${kpState.practiceCount} 正确`]
      })
    }
    const lastChange = kpState.history[kpState.history.length - 1]
    return {
      id: kp.id,
      name: kp.name,
      module: kp.category,
      unit: kp.category,
      course: kp.category,
      mastery,
      progress: mastery,
      previousMastery: lastChange ? lastChange.before : 0,
      confidence: tested ? 0.9 : 0,
      weight: 1,
      status: masteryRange(mastery, tested),
      recentChange: lastChange ? lastChange.after - lastChange.before : 0,
      agentEvidence: evidence,
      evidenceCount: (kpState.diagnosis?.total ?? 0) + kpState.practiceCount,
      prerequisiteIds: kp.prerequisites,
      relatedIds: [],
      lastEvaluatedAt: kpState.lastResult?.at ?? ''
    }
  })
}

export function kpTested(kpId: string): boolean {
  const s = getDemoState().kpStates[kpId]
  return s.diagnosis !== null || s.practiceCount > 0
}

export function kpMastery(kpId: string): number {
  const s = getDemoState().kpStates[kpId]
  return kpTested(kpId) ? Math.round(s.mastery) : 0
}
