import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AsyncLocalStorage } from 'node:async_hooks'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
function tracesPath() {
  return process.env.ZHIXUE_TRACE_FILE || path.join(__dirname, '..', 'evidence-data', 'traces.json')
}

function ensureDir() {
  fs.mkdirSync(path.dirname(tracesPath()), { recursive: true })
}

/**
 * 账号上下文（P0 数据隔离 · feat/mobile-v1）。
 * 由 server/index.js 的认证中间件在每次请求时注入；
 * orchestrator 等深层调用无需改签名即可把 trace 归属到当前账号。
 * 历史 trace 没有 accountId 字段，一律按 'default' 归属（仅 default 账号可见）。
 */
const accountStorage = new AsyncLocalStorage()
const LEGACY_ACCOUNT = 'default'

export function runWithAccount(accountId, fn) {
  return accountStorage.run(accountId, fn)
}

export function currentAccount() {
  return accountStorage.getStore() || LEGACY_ACCOUNT
}

function traceAccount(trace) {
  return trace.accountId || LEGACY_ACCOUNT
}

/* ———————————— P4-2B-6 治理策略 ———————————— */

/** 追踪保留期限（天）：超期记录在读取时清理（非关键诊断数据） */
export const TRACE_RETENTION_DAYS = 14
/** 单账号 trace 上限：超出滚动删除最旧（防活跃账号挤占他人） */
export const TRACE_PER_ACCOUNT_LIMIT = 100

/** 调试开关：显式 opt-in 才在 trace 中保留原始内容（默认脱敏） */
function keepContent() {
  return process.env.ZHIXUE_TRACE_KEEP_CONTENT === '1'
}

/** 文本最小化：原文 → 长度摘要（保留可诊断的体量信息，不存内容） */
function minimizeText(value) {
  const text = String(value ?? '')
  if (!text) return ''
  return `内容(${text.length}字，已脱敏)`
}

/**
 * 落库前脱敏（P4-2B-6）。
 * 判定：trace 是诊断/证据展示数据，不是业务权威源（教学证据以
 * tutoring_history/chat_messages 为准）。默认不落原始问题/回答
 * 文本（隐私最小化）；agentResults 的输入输出摘要同样处理。
 * 调试场景经 ZHIXUE_TRACE_KEEP_CONTENT=1 显式开启原文保留。
 */
function sanitizeTrace(trace) {
  if (keepContent()) return trace
  return {
    ...trace,
    inputsSummary: minimizeText(trace.inputsSummary),
    outputsSummary: minimizeText(trace.outputsSummary),
    agentResults: Array.isArray(trace.agentResults)
      ? trace.agentResults.map(r => ({
          ...r,
          inputSummary: minimizeText(r.inputSummary),
          outputSummary: minimizeText(r.outputSummary),
        }))
      : trace.agentResults,
  }
}

/** 保留期过滤 + 每账号上限（读取统一入口，写入前同样执行） */
function applyRetention(traces) {
  const cutoff = Date.now() - TRACE_RETENTION_DAYS * 24 * 3600 * 1000
  const fresh = traces.filter(t => {
    const at = Date.parse(t.timestamp || 0)
    return Number.isFinite(at) ? at >= cutoff : true
  })
  const perAccount = new Map()
  const kept = []
  // 从新到旧遍历，每账号保留最近 N 条
  for (let i = fresh.length - 1; i >= 0; i -= 1) {
    const trace = fresh[i]
    const account = traceAccount(trace)
    const count = perAccount.get(account) || 0
    if (count >= TRACE_PER_ACCOUNT_LIMIT) continue
    perAccount.set(account, count + 1)
    kept.push(trace)
  }
  return kept.reverse()
}

export function readTraces() {
  ensureDir()
  const fp = tracesPath()
  if (!fs.existsSync(fp)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'))
    return applyRetention(Array.isArray(parsed) ? parsed : [])
  } catch {
    return []
  }
}

/** 仅返回指定账号的 trace（按时间正序）。 */
export function readTracesForAccount(accountId) {
  return readTraces().filter(trace => traceAccount(trace) === accountId)
}

function writeTraces(traces) {
  // 故障注入（P4-2B-3a 测试脚手架，默认关闭）：模拟追踪文件不可写，
  // 验证「追踪失败不得把已成功的聊天事务变成业务失败」。
  if (process.env.ZHIXUE_FAULT_INJECT === 'trace-write') {
    throw new Error('FAULT_INJECTION:trace-write')
  }
  ensureDir()
  fs.writeFileSync(tracesPath(), JSON.stringify(traces, null, 2), 'utf8')
}

let traceHook = null

export function setTraceRecordedHook(hook) {
  traceHook = hook
}

/**
 * 记录追踪（P4-2B-3a：非关键诊断数据，尽力而为）。
 *
 * 判定依据：trace 用于证据页展示与降级审计，不属于学习数据权威源。
 * 追踪写入失败（文件不可写/磁盘满/注入故障）只记录 stderr，**不得把
 * 已成功的业务事务（聊天/辅导/反馈）变成业务失败**——否则用户重试
 * 会产生第二份业务记录，两个存储的成功状态互相矛盾。
 */
export function recordTrace(trace) {
  const stamped = sanitizeTrace({ ...trace, accountId: trace.accountId || currentAccount() })
  try {
    const traces = readTraces()
    traces.push(stamped)
    // 保留策略：保留期 + 每账号上限（替代旧的全局 200 条）
    writeTraces(applyRetention(traces))
  } catch (err) {
    console.error('[trace] 追踪写入失败（不影响业务响应）:', err?.message || err)
  }
  if (typeof traceHook === 'function') {
    try {
      // hook 可能返回 Promise；同步 try/catch 抓不到异步 rejection，必须显式 catch
      const result = traceHook(stamped)
      if (result && typeof result.catch === 'function') {
        result.catch(err => console.error('[traceHook] async failed:', err))
      }
    } catch (err) {
      console.error('[traceHook] failed:', err)
    }
  }
  return stamped
}

/** 按账号读取 trace 列表（新→旧分页），杜绝跨账号可见。 */
export function getTraces(accountId, limit = 50, offset = 0) {
  const traces = readTracesForAccount(accountId)
  return traces.slice(-(limit + offset)).slice(0, limit).reverse()
}

export function getTraceSummary(accountId) {
  const traces = readTracesForAccount(accountId)
  const totalTraces = traces.length
  const fallbackCount = traces.filter(t => t.fallbackUsed).length
  const riskFlagCount = traces.filter(t => t.riskFlags && t.riskFlags.length > 0).length

  const agentCounts = {}
  const agentStats = {}
  let totalDurationMs = 0
  for (const t of traces) {
    if (t.agents) {
      for (const a of t.agents) {
        agentCounts[a] = (agentCounts[a] || 0) + 1
      }
    }
    if (t.durationMs) {
      totalDurationMs += t.durationMs
    }
    if (!Array.isArray(t.agentResults)) continue
    for (const agent of t.agentResults) {
      const key = agent.agentId || agent.agentName
      if (!key) continue
      if (!agentStats[key]) {
        agentStats[key] = {
          ...(agent.agentId ? { agentId: agent.agentId } : {}),
          agentName: agent.agentName || agent.agentId,
          totalRuns: 0,
          fallbackCount: 0,
          avgConfidence: 0,
          avgDurationMs: 0,
        }
      }
      const s = agentStats[key]
      s.avgConfidence = (s.avgConfidence * s.totalRuns + (agent.confidence || 0)) / (s.totalRuns + 1)
      s.avgDurationMs = (s.avgDurationMs * s.totalRuns + (agent.durationMs || 0)) / (s.totalRuns + 1)
      s.totalRuns += 1
      if (agent.fallbackUsed) s.fallbackCount += 1
    }
  }

  const riskFlags = []
  for (const trace of traces) {
    if (trace.riskFlags) riskFlags.push(...trace.riskFlags)
  }

  return {
    totalTraces,
    fallbackCount,
    fallbackRate: totalTraces > 0 ? Math.round((fallbackCount / totalTraces) * 100) : 0,
    riskFlagCount,
    riskRate: totalTraces > 0 ? Math.round((riskFlagCount / totalTraces) * 100) : 0,
    avgDurationMs: totalTraces > 0 ? Math.round(totalDurationMs / totalTraces) : 0,
    agentCounts,
    agentStats: Object.values(agentStats).map(s => ({
      ...s,
      avgConfidence: Math.round(s.avgConfidence * 100) / 100,
      avgDurationMs: Math.round(s.avgDurationMs),
    })),
    riskFlags: riskFlags.slice(-20),
    lastTraceAt: totalTraces > 0 ? traces[traces.length - 1].timestamp : null,
  }
}

export function buildTrace({ requestId, agents, inputsSummary, outputsSummary, evidence, riskFlags, fallbackUsed, durationMs, agentResults }) {
  const normalizedAgentResults = agentResults || []
  return {
    requestId: requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    agents: agents || [],
    inputsSummary: inputsSummary || '',
    outputsSummary: outputsSummary || '',
    evidence: evidence || [],
    riskFlags: riskFlags || [],
    fallbackUsed: fallbackUsed || false,
    securityRefused: normalizedAgentResults.some(result => result.securityRefused),
    fallbackAgents: normalizedAgentResults.filter(result => result.fallbackUsed).map(result => result.agentName),
    durationMs: durationMs || 0,
    agentResults: normalizedAgentResults.map(r => ({
      agentName: r.agentName,
      inputSummary: r.inputSummary || '',
      outputSummary: r.outputSummary || '',
      confidence: r.confidence,
      evidence: r.evidence || [],
      riskFlags: r.riskFlags || [],
      securityRefused: r.securityRefused || false,
      durationMs: r.durationMs || 0,
      fallbackUsed: r.fallbackUsed || false,
    })),
  }
}
