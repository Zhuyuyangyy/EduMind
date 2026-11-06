/**
 * 7 天个性化学习计划生成（确定性、可解释）
 *
 * 生成规则：
 * 1. 选点：从最薄弱的知识点开始，连带其先修闭包一起选入（容量 5 个学习日），
 *    薄弱知识点不会被先修链上无关的知识点挤占；
 * 2. 排序：先修在前；同轮候选优先「能解锁链上后续薄弱点」的知识点，
 *    保证薄弱知识点的先修连续安排；其次按掌握度升序，最后按 id 保证确定性；
 * 3. 前 5 天安排选入知识点的专项任务，第 6 天综合项目，第 7 天综合测评；
 * 4. 每个任务附带推荐理由（引用当前掌握度与先修状态），保证可解释；
 * 5. 相同输入必定产生相同计划（无随机性），便于测试与复现。
 */
import type { DemoCourse, KpMasteryState, PlanTask } from './types.ts'
import { MASTERY_RULES } from './mastery.ts'

/** 未测试知识点的排序优先级分（低于「需加强」的上限，高于典型「学习中」） */
const UNTESTED_PRIORITY = 45

/** 先修掌握度达标线：达到该值才认为可以安全学习后续知识点 */
const PREREQ_READY = 60

/** 学习日容量：前 5 天安排知识点专项任务 */
const LEARNING_DAY_CAPACITY = 5

function isTested(state: KpMasteryState | undefined): boolean {
  return state !== undefined && (state.diagnosis !== null || state.practiceCount > 0)
}

function priorityOf(state: KpMasteryState | undefined): number {
  if (!isTested(state)) return UNTESTED_PRIORITY
  return state!.mastery
}

function latestEvidence(state: KpMasteryState | undefined): string {
  if (!state || !state.lastResult) return '暂无测试记录'
  const { correct, total, kind } = state.lastResult
  const kindLabel = kind === 'diagnosis' ? '诊断' : '练习'
  return `最近${kindLabel} ${correct}/${total} 正确`
}

/** 某知识点及其全部传递先修的拓扑序列（先修在前） */
function prerequisiteClosure(course: DemoCourse, kpId: string): string[] {
  const byId = new Map(course.knowledgePoints.map((kp) => [kp.id, kp]))
  const result: string[] = []
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    for (const p of byId.get(id)?.prerequisites ?? []) visit(p)
    result.push(id)
  }
  visit(kpId)
  return result
}

/**
 * 选择进入计划的知识点（容量 5）：
 * 从最薄弱的知识点开始，连带其先修闭包一起选入；闭包放不下则跳过该点，尝试下一个。
 * 这样薄弱知识点不会被先修链上无关的知识点挤占掉。
 */
function selectLearningKps(course: DemoCourse, kpStates: Record<string, KpMasteryState>): string[] {
  const sorted = [...course.knowledgePoints].sort((a, b) => {
    const pa = priorityOf(kpStates[a.id])
    const pb = priorityOf(kpStates[b.id])
    if (pa !== pb) return pa - pb
    return a.id.localeCompare(b.id)
  })
  const selected = new Set<string>()
  for (const kp of sorted) {
    if (selected.has(kp.id)) continue
    const closure = prerequisiteClosure(course, kp.id).filter((id) => !selected.has(id))
    if (selected.size + closure.length <= LEARNING_DAY_CAPACITY) {
      for (const id of closure) selected.add(id)
    }
  }
  return [...selected]
}

/**
 * 对选中的知识点排序：先修在前；同轮候选优先选择「能解锁链上后续薄弱点」的知识点
 * （保证薄弱知识点的先修连续安排，而不是被无关知识点插队），其次按掌握度，最后按 id 保证确定性。
 */
function orderLearningKps(course: DemoCourse, selected: string[], kpStates: Record<string, KpMasteryState>): string[] {
  const prereqOf = new Map(course.knowledgePoints.map((kp) => [kp.id, kp.prerequisites]))
  const selectedSet = new Set(selected)
  const placed = new Set<string>()
  const remaining = [...selected]
  const order: string[] = []

  while (remaining.length > 0) {
    const ready = remaining.filter((id) =>
      (prereqOf.get(id) ?? []).every((p) => placed.has(p) || !selectedSet.has(p))
    )
    const pool = ready.length > 0 ? ready : remaining
    pool.sort((a, b) => {
      const unblocksA = remaining.some((other) => other !== a && (prereqOf.get(other) ?? []).includes(a))
      const unblocksB = remaining.some((other) => other !== b && (prereqOf.get(other) ?? []).includes(b))
      if (unblocksA !== unblocksB) return unblocksA ? -1 : 1
      const pa = priorityOf(kpStates[a])
      const pb = priorityOf(kpStates[b])
      if (pa !== pb) return pa - pb
      return a.localeCompare(b)
    })
    const next = pool[0]
    order.push(next)
    placed.add(next)
    remaining.splice(remaining.indexOf(next), 1)
  }
  return order
}

function prereqReadiness(
  course: DemoCourse,
  kpId: string,
  kpStates: Record<string, KpMasteryState>,
  plannedDayOf: Map<string, number>
): string {
  const kp = course.knowledgePoints.find((k) => k.id === kpId)
  const prereqs = kp?.prerequisites ?? []
  if (prereqs.length === 0) return '无先修要求'
  const nameOf = (id: string) => course.knowledgePoints.find((k) => k.id === id)?.name ?? id
  const parts = prereqs.map((p) => {
    const state = kpStates[p]
    const mastery = state?.mastery ?? 0
    if (isTested(state) && mastery >= PREREQ_READY) {
      return `先修「${nameOf(p)}」掌握度 ${mastery}% 已达标`
    }
    const day = plannedDayOf.get(p)
    if (day !== undefined) {
      return `先修「${nameOf(p)}」已安排在本计划 Day ${day}`
    }
    return `先修「${nameOf(p)}」掌握度 ${mastery}% 仍需巩固，建议先行复习`
  })
  return parts.join('；')
}

/** 生成 7 天学习计划 */
export function generatePlan(course: DemoCourse, kpStates: Record<string, KpMasteryState>): PlanTask[] {
  const kpById = new Map(course.knowledgePoints.map((kp) => [kp.id, kp]))
  const selected = selectLearningKps(course, kpStates)
  const order = orderLearningKps(course, selected, kpStates)
  const plannedDayOf = new Map<string, number>()
  const tasks: PlanTask[] = []

  order.forEach((kpId, index) => {
    const day = index + 1
    const kp = kpById.get(kpId)!
    const state = kpStates[kpId]
    const tested = isTested(state)
    const mastery = tested ? state.mastery : 0
    const isWeak = tested && mastery < MASTERY_RULES.WEAK_THRESHOLD
    const kind: PlanTask['kind'] = isWeak ? 'learn' : 'practice'
    plannedDayOf.set(kpId, day)

    let reason: string
    if (!tested) {
      reason = `「${kp.name}」尚未产生学习证据，安排入门学习建立基线（预计 ${kp.estMinutes} 分钟）`
    } else if (isWeak) {
      reason = `「${kp.name}」当前掌握度 ${mastery}%（${latestEvidence(state)}），为最薄弱知识点之一，优先安排专项学习与 AI 讲解`
    } else {
      reason = `「${kp.name}」当前掌握度 ${mastery}%（${latestEvidence(state)}），安排针对性练习巩固提升`
    }
    const prereq = prereqReadiness(course, kpId, kpStates, plannedDayOf)
    if (prereq !== '无先修要求') reason += `；${prereq}`

    tasks.push({
      key: `day-${day}-${kpId}`,
      day,
      kpId,
      kpName: kp.name,
      kind,
      title: isWeak ? '专项学习 + AI 讲解' : '针对性练习',
      minutes: kp.estMinutes,
      reason
    })
  })

  // 第 6 天：综合项目（整合最优先安排的 3 个知识点）
  const focusNames = order.slice(0, 3).map((id) => `「${kpById.get(id)!.name}」`)
  tasks.push({
    key: 'day-6-project',
    day: 6,
    kpId: null,
    kpName: '综合项目练习',
    kind: 'project',
    title: '综合项目：销售数据小分析',
    minutes: 40,
    reason: `整合本周重点${focusNames.join('、')}，完成一个端到端小项目（读取 → 清洗 → 分组 → 可视化），检验知识迁移能力`
  })

  // 第 7 天：综合测评
  tasks.push({
    key: 'day-7-assessment',
    day: 7,
    kpId: null,
    kpName: '综合测评',
    kind: 'assessment',
    title: '综合测评 + 画像更新',
    minutes: 30,
    reason: '对本周学习内容进行综合测评，系统将根据结果更新知识画像，并自动调整下一阶段学习计划'
  })

  return tasks
}

/** 对比两份计划，返回发生变化的说明（用于「计划已重新生成」提示） */
export function planChangeSummary(prev: PlanTask[], next: PlanTask[]): string[] {
  const changes: string[] = []
  const prevByDay = new Map(prev.map((t) => [t.day, t]))
  for (const task of next) {
    const before = prevByDay.get(task.day)
    if (!before) {
      changes.push(`Day ${task.day} 新增任务：${task.kpName} · ${task.title}`)
      continue
    }
    if (before.kpId !== task.kpId || before.kind !== task.kind) {
      changes.push(
        `Day ${task.day} 任务由「${before.kpName} · ${before.title}」调整为「${task.kpName} · ${task.title}」`
      )
    }
  }
  return changes
}

/** 下一个未完成的任务（用于首页「今日任务」） */
export function nextPendingTask(tasks: PlanTask[], completion: Record<string, boolean>): PlanTask | null {
  return tasks.find((t) => !completion[t.key]) ?? null
}

/** 计划完成度 */
export function planProgress(tasks: PlanTask[], completion: Record<string, boolean>) {
  const done = tasks.filter((t) => completion[t.key]).length
  return { done, total: tasks.length, ratio: tasks.length === 0 ? 0 : done / tasks.length }
}
