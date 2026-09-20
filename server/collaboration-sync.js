import { readTraces } from './evidence/recorder.js'
import { saveCollaboration, resolveDay, getCollaborationByDay } from './store/agent-collaboration.js'
import { AGENT_DEFS, MODULE_DEFS, generateDailyCollaboration } from './collaboration-data.js'

const AGENT_NAME_TO_MODULE = {
  ProfileAgent: 'profile-module',
  PathAgent: 'path-module',
  ResourceAgent: 'resource-module',
  TutorAgent: 'tutor-module',
  EvaluationAgent: 'eval-module',
  ReflectionAgent: 'feedback-module',
  KnowledgePathAgent: 'path-module',
}

const MODULE_AGENT_ROLES = {
  'profile-module': ['profileCapture', 'profileDiagnosis'],
  'path-module': ['pathPlan', 'pathReplan'],
  'resource-module': ['resourceSearch', 'resourceGenerate'],
  'tutor-module': ['tutorExplain', 'tutorDialogue'],
  'eval-module': ['evalQuiz', 'evalCause'],
  'feedback-module': ['feedbackWrite', 'reflection'],
}

const MODULE_EVENT_TEMPLATES = {
  'profile-module': { type: 'PC', label: '画像采集与诊断', detail: '真实画像问卷/信号触发，更新薄弱点识别。' },
  'path-module': { type: 'PL', label: '路径规划与重规划', detail: '根据画像/评估结果生成或调整学习路径。' },
  'resource-module': { type: 'RS', label: '资源检索与生成', detail: '针对薄弱点检索并生成适配资源。' },
  'tutor-module': { type: 'TX', label: '讲解辅导与答疑', detail: '真实学生提问驱动的辅导互动。' },
  'eval-module': { type: 'QZ', label: '阶段测评与错因分析', detail: '基于练习/测评数据生成诊断证据。' },
  'feedback-module': { type: 'FB', label: '反馈回写与成长复盘', detail: '把测评结论回写画像并沉淀复盘。' },
}

const START_MINUTES = 9 * 60
const END_MINUTES = 18 * 60

function minutesForTimestamp(isoString) {
  const date = new Date(isoString)
  const minutes = date.getHours() * 60 + date.getMinutes()
  return Math.max(START_MINUTES, Math.min(END_MINUTES - 1, minutes))
}

function getDayIndexForDate(isoString) {
  const date = new Date(isoString)
  const jsDay = date.getDay()
  return (jsDay + 6) % 7
}

function getDateString(isoString) {
  return isoString.slice(0, 10)
}

function buildModuleEvents(tracesForDay, moduleId, baseIndex) {
  const agentIds = MODULE_AGENT_ROLES[moduleId]
  const tpl = MODULE_EVENT_TEMPLATES[moduleId]
  const moduleTraces = tracesForDay.filter(t => {
    const primary = t.agents?.[0]
    return AGENT_NAME_TO_MODULE[primary] === moduleId
  })

  if (moduleTraces.length === 0) return []

  return moduleTraces.map((trace, i) => {
    const agentId = agentIds[i % agentIds.length]
    const agent = AGENT_DEFS.find(a => a.id === agentId)
    return {
      id: `${moduleId}-e${baseIndex + i}`,
      chain: moduleId,
      agent: agentId,
      t: minutesForTimestamp(trace.timestamp),
      type: tpl.type,
      label: `${tpl.label} #${i + 1}`,
      detail: trace.outputsSummary || trace.inputsSummary || tpl.detail,
    }
  })
}

export function buildCollaborationFromTraces(traces) {
  if (!traces || traces.length === 0) return null

  const byDay = new Map()
  for (const trace of traces) {
    const dayIndex = getDayIndexForDate(trace.timestamp)
    if (!byDay.has(dayIndex)) byDay.set(dayIndex, [])
    byDay.get(dayIndex).push(trace)
  }

  const resultByDay = new Map()
  for (const [dayIndex, dayTraces] of byDay) {
    const { name, label } = resolveDay(dayIndex)
    const dateString = getDateString(dayTraces[0].timestamp)

    const chains = []
    const allEvents = []
    let eventBaseIndex = 0

    for (const mod of MODULE_DEFS) {
      const events = buildModuleEvents(dayTraces, mod.id, eventBaseIndex)
      eventBaseIndex += events.length
      if (events.length === 0) continue

      allEvents.push(...events)
      chains.push({
        id: mod.id,
        name: mod.name,
        summary: `当日真实 ${mod.name} 协作链路。`,
        issue: '基于真实智能体执行记录聚合。',
        outcome: `共发生 ${events.length} 次接力干预。`,
        eventIds: events.map(e => e.id),
      })
    }

    if (allEvents.length === 0) continue

    const modules = MODULE_DEFS.map(mod => {
      const chain = chains.find(c => c.id === mod.id)
      const firstAgent = AGENT_DEFS.find(a => a.id === mod.agentIds[0])
      return {
        id: `${mod.id}-card`,
        chainId: mod.id,
        name: mod.name,
        agentNames: mod.agentIds.map(id => AGENT_DEFS.find(a => a.id === id)?.name ?? id),
        color: firstAgent?.color ?? '#8F7CFF',
        artSrc: firstAgent?.artSrc ?? '/homepage/agent-load-profile.png',
        eventCount: chain ? chain.eventIds.length : 0,
      }
    })

    resultByDay.set(dayIndex, {
      dayOfWeek: dayIndex,
      dayName: name,
      dayLabel: label,
      dateString,
      totalAgents: AGENT_DEFS.length,
      totalEvents: allEvents.length,
      totalChains: chains.length,
      agents: AGENT_DEFS,
      chains,
      events: allEvents,
      modules,
    })
  }

  return resultByDay
}

export async function syncTracesToCollaboration() {
  const traces = readTraces()
  const byDay = buildCollaborationFromTraces(traces)
  if (!byDay) return false

  for (const [dayIndex, payload] of byDay) {
    const { name } = resolveDay(dayIndex)
    await saveCollaboration(name, payload)
  }
  return true
}

function filterTracesByDay(traces, dayParam) {
  const { index } = resolveDay(dayParam)
  return traces.filter(t => getDayIndexForDate(t.timestamp) === index)
}

function mergeWithSimulated(real, dayIndex) {
  if (!real || real.totalEvents === 0) {
    return generateDailyCollaboration(dayIndex)
  }

  const simulated = generateDailyCollaboration(dayIndex)
  const missingModules = MODULE_DEFS.filter(mod => !real.chains.find(c => c.id === mod.id))

  if (missingModules.length === 0) return real

  const mergedChains = [...real.chains]
  const mergedEvents = [...real.events]

  for (const mod of missingModules) {
    const simChain = simulated.chains.find(c => c.id === mod.id)
    const simEvents = simulated.events.filter(e => e.chain === mod.id)
    if (!simChain) continue
    mergedChains.push(simChain)
    mergedEvents.push(...simEvents)
  }

  mergedChains.sort((a, b) => MODULE_DEFS.findIndex(m => m.id === a.id) - MODULE_DEFS.findIndex(m => m.id === b.id))
  mergedEvents.sort((a, b) => {
    const modDiff = MODULE_DEFS.findIndex(m => m.id === a.chain) - MODULE_DEFS.findIndex(m => m.id === b.chain)
    if (modDiff !== 0) return modDiff
    return a.t - b.t
  })

  const modules = MODULE_DEFS.map(mod => {
    const chain = mergedChains.find(c => c.id === mod.id)
    const firstAgent = AGENT_DEFS.find(a => a.id === mod.agentIds[0])
    return {
      id: `${mod.id}-card`,
      chainId: mod.id,
      name: mod.name,
      agentNames: mod.agentIds.map(id => AGENT_DEFS.find(a => a.id === id)?.name ?? id),
      color: firstAgent?.color ?? '#8F7CFF',
      artSrc: firstAgent?.artSrc ?? '/homepage/agent-load-profile.png',
      eventCount: chain ? chain.eventIds.length : 0,
    }
  })

  return {
    ...real,
    totalEvents: mergedEvents.length,
    totalChains: mergedChains.length,
    chains: mergedChains,
    events: mergedEvents,
    modules,
  }
}

export function buildCollaborationForDay(dayParam, traces) {
  const dayTraces = filterTracesByDay(traces, dayParam)
  const byDay = buildCollaborationFromTraces(dayTraces)
  const { index } = resolveDay(dayParam)
  const real = byDay?.get(index) || null
  return mergeWithSimulated(real, index)
}

export async function getCollaborationForDay(dayParam) {
  const traces = readTraces()
  const merged = buildCollaborationForDay(dayParam, traces)
  if (merged && merged.totalEvents > 0) {
    const { name } = resolveDay(dayParam)
    await saveCollaboration(name, merged)
    return merged
  }
  return null
}
