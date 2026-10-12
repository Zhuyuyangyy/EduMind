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

export function readTraces() {
  ensureDir()
  const fp = tracesPath()
  if (!fs.existsSync(fp)) return []
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
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
  const stamped = { ...trace, accountId: trace.accountId || currentAccount() }
  try {
    const traces = readTraces()
    traces.push(stamped)
    const kept = traces.slice(-200)
    writeTraces(kept)
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
