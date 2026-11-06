/**
 * 掌握度模型（移植并简化自原工程 server/study/profile-updater.js 的证据驱动更新规则）
 *
 * 可解释性保证（界面上需向用户明示）：
 * 1. 诊断只建立基线：诊断正确率最高映射到 75 分，避免「一题定生死」；
 * 2. 证据量门槛：单次练习该知识点作答题数 < 2 不调整掌握度（避免偶然性）；
 * 3. 稳定区间：练习正确率处于 [40%, 80%) 时掌握度维持不变（过滤噪声波动）；
 * 4. 变化上限：单次练习单知识点掌握度变化不超过 ±MAX_DELTA；
 * 5. 取值范围钳制在 [0, 100]。
 *
 * 注意：本模型输出为「演示评估值」，不是经过真实用户实验验证的学习能力测量。
 */
import type { KpMasteryState, MasteryStatus } from './types.ts'

export const MASTERY_RULES = {
  /** 诊断基线的最高映射分 */
  DIAGNOSIS_MAX: 75,
  /** 单次练习生效所需的最少作答题数 */
  MIN_SESSION_QUESTIONS: 2,
  /** 稳定区间下界（含） */
  STABLE_LOW: 0.4,
  /** 稳定区间上界（不含） */
  STABLE_HIGH: 0.8,
  /** 单次练习单知识点的最大变化幅度 */
  MAX_DELTA: 8,
  /** 「已掌握」阈值 */
  MASTERED_THRESHOLD: 80,
  /** 「需加强」阈值（低于该值） */
  WEAK_THRESHOLD: 40
} as const

/** 由诊断正确率计算基线掌握度（0-100，演示评估值） */
export function initialMasteryFromDiagnosis(correct: number, total: number): number {
  if (total <= 0) return 0
  const rate = correct / total
  return Math.round(rate * MASTERY_RULES.DIAGNOSIS_MAX)
}

/** 掌握度状态分档 */
export function statusOf(mastery: number, tested: boolean): MasteryStatus {
  if (!tested) return 'untested'
  if (mastery >= MASTERY_RULES.MASTERED_THRESHOLD) return 'mastered'
  if (mastery < MASTERY_RULES.WEAK_THRESHOLD) return 'weak'
  return 'learning'
}

export const STATUS_LABEL: Record<MasteryStatus, string> = {
  untested: '未测试',
  weak: '需加强',
  learning: '学习中',
  mastered: '已掌握'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export interface PracticeUpdateResult {
  state: KpMasteryState
  before: number
  after: number
  delta: number
  changed: boolean
  reason: string
}

/**
 * 用一次练习会话的结果更新某知识点的掌握度。
 * 规则见文件头注释；返回新状态与可解释的变化原因。
 */
export function applyPracticeSession(
  state: KpMasteryState,
  correct: number,
  total: number,
  at: string
): PracticeUpdateResult {
  const before = state.mastery

  if (total < MASTERY_RULES.MIN_SESSION_QUESTIONS) {
    return {
      state,
      before,
      after: before,
      delta: 0,
      changed: false,
      reason: `本次练习仅作答 ${total} 题（少于 ${MASTERY_RULES.MIN_SESSION_QUESTIONS} 题），证据量不足，掌握度暂不调整`
    }
  }

  const rate = correct / total

  if (rate >= MASTERY_RULES.STABLE_LOW && rate < MASTERY_RULES.STABLE_HIGH) {
    return {
      state,
      before,
      after: before,
      delta: 0,
      changed: false,
      reason: `本次练习正确率 ${(rate * 100).toFixed(0)}% 处于稳定区间 [40%, 80%)，掌握度维持 ${before} 不变`
    }
  }

  const delta =
    rate >= MASTERY_RULES.STABLE_HIGH
      ? Math.round(
          (MASTERY_RULES.MAX_DELTA * (rate - MASTERY_RULES.STABLE_HIGH)) /
            (1 - MASTERY_RULES.STABLE_HIGH)
        )
      : -Math.round(
          (MASTERY_RULES.MAX_DELTA * (MASTERY_RULES.STABLE_LOW - rate)) /
            MASTERY_RULES.STABLE_LOW
        )

  const after = clamp(before + delta, 0, 100)
  const actualDelta = after - before

  if (actualDelta === 0) {
    return {
      state,
      before,
      after: before,
      delta: 0,
      changed: false,
      reason:
        before === 100
          ? '掌握度已达上限 100，本次练习正确率良好，维持不变'
          : '掌握度已在下限 0，本次练习表现不佳，维持不变'
    }
  }

  const direction = actualDelta > 0 ? '提升' : '下降'
  const next: KpMasteryState = {
    ...state,
    mastery: after,
    lastResult: { correct, total, at, kind: 'practice' },
    practiceCount: state.practiceCount + total,
    practiceCorrect: state.practiceCorrect + correct,
    history: [
      ...state.history,
      {
        at,
        before,
        after,
        reason: `练习正确率 ${(rate * 100).toFixed(0)}%（${correct}/${total}）超出稳定区间，掌握度${direction} ${Math.abs(actualDelta)} 分`,
        kind: 'practice' as const
      }
    ]
  }

  return {
    state: next,
    before,
    after,
    delta: actualDelta,
    changed: true,
    reason:
      `练习正确率 ${(rate * 100).toFixed(0)}%（${correct}/${total}）超出稳定区间 [40%, 80%)，` +
      `掌握度${direction} ${Math.abs(actualDelta)} 分（${before} → ${after}）`
  }
}

/** 由诊断结果建立某知识点的基线状态 */
export function buildDiagnosisBaseline(
  kpId: string,
  correct: number,
  total: number,
  at: string
): KpMasteryState {
  const mastery = initialMasteryFromDiagnosis(correct, total)
  return {
    kpId,
    mastery,
    diagnosis: { correct, total },
    practiceCount: 0,
    practiceCorrect: 0,
    lastResult: { correct, total, at, kind: 'diagnosis' },
    history: [
      {
        at,
        before: 0,
        after: mastery,
        reason:
          total > 0
            ? `诊断正确率 ${(correct / total) * 100}（${correct}/${total}），按演示规则映射为基线掌握度 ${mastery}（诊断最高记 ${MASTERY_RULES.DIAGNOSIS_MAX} 分）`
            : '无诊断数据，基线掌握度记为 0',
        kind: 'diagnosis' as const
      }
    ]
  }
}

/** 未测试知识点的初始状态 */
export function createUntestedState(kpId: string): KpMasteryState {
  return {
    kpId,
    mastery: 0,
    diagnosis: null,
    practiceCount: 0,
    practiceCorrect: 0,
    lastResult: null,
    history: []
  }
}

/** 总体掌握度：仅对有诊断/练习证据的知识点取均值；无证据返回 null */
export function overallMastery(states: KpMasteryState[]): number | null {
  const tested = states.filter((s) => s.diagnosis !== null || s.practiceCount > 0)
  if (tested.length === 0) return null
  const sum = tested.reduce((acc, s) => acc + s.mastery, 0)
  return Math.round(sum / tested.length)
}
