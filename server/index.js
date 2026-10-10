import http from 'node:http'
import { URL } from 'node:url'
import 'dotenv/config'
import {
  analyzeProfile,
  buildChatReply,
  buildChatReplyAsync,
  buildTutoringReply,
  getChatHistory,
  getEvaluationPayload,
  getLearningPathPayload,
  getLatestProfileResult,
  getRecommendedResources,
  getResources,
  getTutoringHistory,
  getTutoringTopics,
  saveChatHistoryEntry,
  saveProfileResult,
  saveTutoringHistoryEntry,
  getAgentWorkflow,
  generateResourcesPayload,
  getEvidenceTraces,
  getEvidenceSummary,
  saveKnowledgePathResult,
  getLatestKnowledgePath,
} from './data.js'
import {
  orchestrateProfileAnalysis,
  orchestratePathReplan,
  orchestrateTutoring,
  orchestrateFullEvaluation,
  orchestrateFullRun,
  orchestrateKnowledgePath,
  orchestrateLearningUpdate,
  runResourceGeneration,
} from './agents/orchestrator.js'
import { getTraces, getTraceSummary, buildTrace, recordTrace, runWithAccount } from './evidence/recorder.js'
import { isLlmAvailable, getLlmConfig } from './llm/provider.js'
import { getKnowledgeBaseStats, searchKnowledgeBase } from './knowledge-base/vector-store.js'
import { getAccountSettings, getLatestLearningCycle, getLearningCycleHistory, getStorageBackend, saveAccountSettings, saveLearningCycle } from './store/mysql.js'
import { summarizeLearningHistory } from './learner-memory.js'
import {
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  destroySession,
  extractToken,
  getSession,
} from './auth.js'
import {
  saveCollaboration,
  listDays,
  hasAnyCollaboration,
} from './store/agent-collaboration.js'
import { seedAllDays } from './collaboration-data.js'
import { getCollaborationForDay } from './collaboration-sync.js'
import {
  backendName,
  createStudySession,
  getStudySession,
  recordAnswer,
  completeStudySession,
  getStudyStats,
  listLearningEvents,
  listProfileRevisions,
  saveProfileRevision,
  listBankTopics,
  findExercise,
  summarizeAttempts,
} from './study/repository.js'
import { generateStudyFeedback, buildWrongItems } from './study/feedback.js'
import {
  prepareProfileUpdate,
  commitProfileUpdate,
  preparePathUpdate,
  commitPathUpdate,
  UPDATE_RULES,
} from './study/profile-updater.js'
import { claimFeedback, mutateFeedback, getFeedbackState } from './study/feedback-state.js'

const PORT = Number(process.env.PORT || 8788)
const MAX_BODY_SIZE = 1024 * 1024

/**
 * P0 认证改造（feat/mobile-v1）：
 * - 除公开路径外，所有 /api/* 接口必须携带有效会话（httpOnly Cookie 或 Bearer token）。
 * - accountId 一律由服务端会话推导（accountIdOf），客户端传的 accountId 不再被信任。
 * - CORS 由通配 * 改为白名单反射，携带凭证时浏览器才放行。
 */
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/llm/status',
  '/api/auth/login',
  '/api/auth/session',
  '/api/auth/logout',
])

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://localhost', // Capacitor Android
  'capacitor://localhost', // Capacitor iOS
]

function allowedOrigins() {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS
}

function applyCors(req, res) {
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin
  if (!origin) return
  if (!allowedOrigins().includes(origin)) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Max-Age', '600')
}

/** 数据归属只认服务端会话；调用方必须已通过 authMiddleware。 */
function accountIdOf(req) {
  return req.session.account
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not Found' })
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false

    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        tooLarge = true
        chunks.length = 0
        return
      }
      if (!tooLarge) chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        const error = new Error('Payload too large')
        error.statusCode = 413
        reject(error)
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        error.statusCode = 400
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function listResources(searchParams) {
  const type = searchParams.get('type')
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const resources = getResources()

  return resources.filter(item => {
    if (type && type !== 'all' && item.type !== type) {
      return false
    }
    if (!q) {
      return true
    }
    return item.title.toLowerCase().includes(q) || item.tags.some(tag => tag.toLowerCase().includes(q))
  })
}

function latestUserMessage(messages) {
  if (!Array.isArray(messages)) return ''
  const latest = [...messages].reverse().find(item => item?.sender === 'user' || item?.role === 'user')
  return String(latest?.text || latest?.content || '').trim()
}

function toDialogueChatReply(reply) {
  return {
    reply: reply.content,
    extractedDimensions: {},
    capturedTags: [],
    suggestChips: reply.suggestions ?? [],
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    notFound(res)
    return
  }

  if (req.method === 'OPTIONS') {
    applyCors(req, res)
    res.writeHead(204, {
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Max-Age': '600',
    })
    res.end()
    return
  }

  applyCors(req, res)

  const url = new URL(req.url, `http://${req.headers.host}`)
  const { pathname, searchParams } = url

  // 全部 /api 路由（公开路径也在内，只是没有账号上下文）
  const routeApi = async () => {
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        version: '2.0.0',
        features: ['multi-agent', 'llm-provider', 'evidence-recorder'],
        llmConfigured: isLlmAvailable(),
        storageBackend: getStorageBackend(),
      })
      return
    }

    // 返回 LLM 配置状态（不暴露密钥），供设置页"关于"模块展示
    if (req.method === 'GET' && pathname === '/api/llm/status') {
      const cfg = getLlmConfig()
      const configured = isLlmAvailable()
      let apiHostHint = null
      if (configured) {
        try { apiHostHint = new URL(cfg.apiUrl).host } catch { apiHostHint = null }
      }
      sendJson(res, 200, {
        configured,
        provider: configured ? (cfg.apiUrl.includes('deepseek') ? 'deepseek' : 'openai-compatible') : 'none',
        model: cfg.model || 'none',
        // 不返回 apiKey 和完整 apiUrl，仅返回域名前缀以备诊断
        apiHostHint,
      })
      return
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(req)
      const account = String(body.account || '').trim()
      const password = String(body.password || '')
      const role = body.role === 'admin' ? 'admin' : 'student'
      // 演示环境提供两组等效的学生端演示账号，避免不同版本文档/截图口径不一致导致评审无法登录。
      const studentCredentials = [
        {
          account: process.env.DEMO_STUDENT_ACCOUNT || 'reviewer',
          password: process.env.DEMO_STUDENT_PASSWORD || 'Zhixue2026!',
        },
        {
          account: process.env.DEMO_STUDENT_ACCOUNT_ALT || 'student',
          password: process.env.DEMO_STUDENT_PASSWORD_ALT || 'student123',
        },
      ]
      const adminAccount = process.env.DEMO_ADMIN_ACCOUNT || ''
      const adminPassword = process.env.DEMO_ADMIN_PASSWORD || ''
      const studentValid =
        role === 'student' &&
        studentCredentials.some((item) => item.account && item.password && account === item.account && password === item.password)
      const adminValid = role === 'admin' && adminAccount && adminPassword && account === adminAccount && password === adminPassword
      if (!studentValid && !adminValid) {
        sendJson(res, 401, { error: 'Unauthorized', message: '账号或密码错误，管理员演示入口默认关闭。' })
        return
      }
      const displayName = role === 'admin' ? '演示管理员' : '评审体验账号'
      const { token, session } = createSession({ account, role, displayName })
      sendJson(res, 200, {
        account,
        role,
        displayName,
        token,
        expiresAt: new Date(session.expiresAt).toISOString(),
      }, { 'Set-Cookie': buildSessionCookie(token, session.expiresAt - Date.now()) })
      return
    }

    // 校验当前会话（启动恢复登录态用）
    if (req.method === 'GET' && pathname === '/api/auth/session') {
      const session = getSession(extractToken(req))
      if (!session) {
        sendJson(res, 401, { error: 'Unauthorized', message: '登录状态无效或已过期，请重新登录。' })
        return
      }
      sendJson(res, 200, {
        account: session.account,
        role: session.role,
        displayName: session.displayName,
      })
      return
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      destroySession(extractToken(req))
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
      return
    }

    if (req.method === 'GET' && pathname === '/api/account/settings') {
      sendJson(res, 200, { result: await getAccountSettings(accountIdOf(req)) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/account/settings') {
      const body = await readJson(req)
      const displayName = String(body.displayName || '').trim()
      if (!displayName || displayName.length > 64) {
        sendJson(res, 400, { error: 'Bad Request', message: '用户名长度应为 1 到 64 个字符。' })
        return
      }
      sendJson(res, 200, { result: await saveAccountSettings(accountIdOf(req), { displayName }) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/run') {
      const body = await readJson(req)
      const accountId = accountIdOf(req)
      const result = await orchestrateFullRun({
        answers: body.answers || body,
        topic: body.topic,
        resourceType: body.resourceType,
        question: body.question,
        mode: body.mode,
      })
      await saveProfileResult(result.profile, accountId)
      await saveLearningCycle(accountId, result)
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/resources/generate') {
      const body = await readJson(req)
      const result = await runResourceGeneration(body)
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && pathname === '/api/evidence/traces') {
      const limit = Math.min(Number(searchParams.get('limit')) || 50, 100)
      const offset = Number(searchParams.get('offset')) || 0
      sendJson(res, 200, { items: getTraces(accountIdOf(req), limit, offset) })
      return
    }

    if (req.method === 'GET' && pathname === '/api/evidence/summary') {
      sendJson(res, 200, getTraceSummary(accountIdOf(req)))
      return
    }

    if (req.method === 'POST' && pathname === '/api/profile/analyze') {
      const body = await readJson(req)
      const agentResult = await orchestrateProfileAnalysis(body)
      await saveProfileResult(agentResult.profile, accountIdOf(req))
      sendJson(res, 200, agentResult.profile)
      return
    }

    if (req.method === 'GET' && pathname === '/api/profile/latest') {
      sendJson(res, 200, { result: await getLatestProfileResult(accountIdOf(req)) })
      return
    }

    // 对话页直接保存画像数据（跳过 agent 分析）
    if (req.method === 'POST' && pathname === '/api/profile/save') {
      const body = await readJson(req)
      if (Array.isArray(body.dimensions) && typeof body.totalScore === 'number') {
        const profile = {
          ...body,
          source: body.source || 'profile-save',
          savedAt: new Date().toISOString(),
        }
        await saveProfileResult(profile, accountIdOf(req))
        sendJson(res, 200, profile)
        return
      }
      // 将对话页的 radarPoints 转为统一格式
      const profile = {
        dimensions: (body.radarPoints || []).map((p) => ({
          label: p.dimension,
          value: p.score,
          color: '#3b82f6',
        })),
        totalScore: body.score || 50,
        weaknesses: (body.weaknesses || []).map((w) => ({ tag: w, count: 1 })),
        recommendations: body.suggestions || [],
        source: 'dialogue',
        savedAt: new Date().toISOString(),
      }
      await saveProfileResult(profile, accountIdOf(req))
      sendJson(res, 200, profile)
      return
    }

    // AI 智能体生成个性化知识路径
    if (req.method === 'POST' && pathname === '/api/knowledge-path/generate') {
      const body = await readJson(req)
      const profile = body.profile || await getLatestProfileResult(accountIdOf(req)) || {}
      const result = await orchestrateKnowledgePath({ profile })
      saveKnowledgePathResult(accountIdOf(req), result.knowledgePath)
      sendJson(res, 200, result.knowledgePath)
      return
    }

    // 获取已生成的知识路径（按账号隔离）
    if (req.method === 'GET' && pathname === '/api/knowledge-path/latest') {
      const kp = getLatestKnowledgePath(accountIdOf(req))
      sendJson(res, 200, { result: kp })
      return
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const body = await readJson(req)
      const isDialoguePayload = Array.isArray(body.messages)
      const message = isDialoguePayload ? latestUserMessage(body.messages) : String(body.message || '').trim()
      const reply = await buildChatReplyAsync(message, body.multimodalContents)
      saveChatHistoryEntry(accountIdOf(req), message, reply, body.multimodalContents)
      const chatTrace = buildTrace({
        requestId: `chat-${Date.now()}`,
        agents: ['ChatAgent'],
        inputsSummary: `消息: ${String(message || '').slice(0, 80)}`,
        outputsSummary: `回复: ${String(reply.content || '').slice(0, 80)}`,
        evidence: [reply.fallbackUsed ? '本地规则生成对话回复' : 'LLM 生成对话回复'],
        riskFlags: [],
        // 如实记录：真实 LLM 成功时不得标记为降级
        fallbackUsed: reply.fallbackUsed !== false,
        durationMs: 0,
        agentResults: [],
      })
      recordTrace(chatTrace)
      sendJson(res, 200, isDialoguePayload ? toDialogueChatReply(reply) : reply)
      return
    }

    if (req.method === 'GET' && pathname === '/api/chat/history') {
      sendJson(res, 200, { items: getChatHistory(accountIdOf(req)) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/tutoring/ask') {
      const body = await readJson(req)
      if (!String(body.question || '').trim()) {
        sendJson(res, 400, { error: 'Bad Request', message: '学习问题不能为空。' })
        return
      }
      const profile = await getLatestProfileResult(accountIdOf(req)) || {}
      const agentResult = await orchestrateTutoring({
        question: body.question,
        mode: body.mode,
        profile,
        resources: [],
      })
      const answer = agentResult.answer
      saveTutoringHistoryEntry(accountIdOf(req), {
        question: String(body.question || '').trim() || '未提供问题',
        answer,
        mode: body.mode || 'qa',
        scenario: body.scenario || 'preview',
        multimodalContents: body.multimodalContents || [],
        // P2-2A：历史条目携带降级元数据，供客户端如实标注来源
        fallbackAgents: agentResult.fallbackAgents || [],
      })
      sendJson(res, 200, {
        answer,
        riskFlags: agentResult.riskFlags || [],
        securityRefused: agentResult.securityRefused || false,
        fallbackAgents: agentResult.fallbackAgents || [],
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      })
      return
    }

    if (req.method === 'GET' && pathname === '/api/tutoring/history') {
      sendJson(res, 200, { items: getTutoringHistory(accountIdOf(req)) })
      return
    }

    if (req.method === 'GET' && pathname === '/api/tutoring/topics') {
      sendJson(res, 200, { topics: getTutoringTopics() })
      return
    }

    if (req.method === 'GET' && pathname === '/api/resources') {
      sendJson(res, 200, { items: listResources(searchParams) })
      return
    }

    if (req.method === 'GET' && pathname === '/api/resources/recommended') {
      sendJson(res, 200, { items: getRecommendedResources() })
      return
    }

    if (req.method === 'GET' && pathname === '/api/learning-path') {
      sendJson(res, 200, getLearningPathPayload())
      return
    }

    if (req.method === 'GET' && pathname === '/api/evaluation') {
      sendJson(res, 200, getEvaluationPayload())
      return
    }

    if (req.method === 'GET' && pathname === '/api/agent/workflow') {
      sendJson(res, 200, getAgentWorkflow())
      return
    }

    if (req.method === 'GET' && pathname === '/api/knowledge/status') {
      sendJson(res, 200, getKnowledgeBaseStats())
      return
    }

    if (req.method === 'POST' && pathname === '/api/knowledge/search') {
      const body = await readJson(req)
      const profile = body.profile || await getLatestProfileResult(accountIdOf(req)) || {}
      const result = searchKnowledgeBase({
        query: body.query,
        profile,
        learningData: body.learningData,
        exerciseResults: body.exerciseResults,
        limit: body.limit,
      })
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/profile') {
      const body = await readJson(req)
      const result = await orchestrateProfileAnalysis(body)
      await saveProfileResult(result.profile, accountIdOf(req))
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/path-replan') {
      const body = await readJson(req)
      const profile = body.profile || await getLatestProfileResult(accountIdOf(req)) || {}
      const result = await orchestratePathReplan({
        profile,
        evaluation: body.evaluation,
        currentPath: body.currentPath,
      })
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/tutor') {
      const body = await readJson(req)
      const accountId = accountIdOf(req)
      const profile = body.profile || await getLatestProfileResult(accountId) || {}
      const learningHistory = summarizeLearningHistory(await getLearningCycleHistory(accountId))
      const result = await orchestrateTutoring({
        question: body.question,
        mode: body.mode,
        profile,
        resources: body.resources,
        hintLevel: body.hintLevel,
        attempts: body.attempts,
        learningHistory,
      })
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/evaluate') {
      const body = await readJson(req)
      const profile = body.profile || await getLatestProfileResult(accountIdOf(req)) || {}
      const result = await orchestrateFullEvaluation({
        profile,
        learningData: body.learningData,
        exerciseResults: body.exerciseResults,
        knowledgeContext: body.knowledgeContext,
      })
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && pathname === '/api/learning-cycles/latest') {
      sendJson(res, 200, { result: await getLatestLearningCycle(accountIdOf(req)) })
      return
    }

    /* ———————————— P3-1 真实学习闭环（服务端判分） ———————————— */

    // 题库主题列表（题目答案不下发）
    if (req.method === 'GET' && pathname === '/api/study/topics') {
      sendJson(res, 200, { topics: listBankTopics(), backend: backendName() })
      return
    }

    // 创建练习会话：服务端选题，客户端只拿题目（无答案）
    if (req.method === 'POST' && pathname === '/api/study/sessions') {
      const body = await readJson(req)
      const result = await createStudySession(accountIdOf(req), {
        topicId: typeof body.topicId === 'string' ? body.topicId : '',
        topicIds: Array.isArray(body.topicIds) ? body.topicIds.filter(id => typeof id === 'string') : undefined,
        phaseId: typeof body.phaseId === 'string' ? body.phaseId : null,
        timezone: typeof body.timezone === 'string' ? body.timezone : null,
        exerciseCount: Number.isInteger(body.exerciseCount) ? body.exerciseCount : null,
      })
      if (result.error) {
        sendJson(res, result.error === 'no-exercises' ? 404 : 400, { error: result.error, message: result.message })
        return
      }
      sendJson(res, 201, result)
      return
    }

    // 会话状态（刷新/重连后恢复；账号越权不可见）
    const sessionMatch = pathname.match(/^\/api\/study\/sessions\/([A-Za-z0-9-]+)$/)
    if (req.method === 'GET' && sessionMatch) {
      const state = await getStudySession(accountIdOf(req), sessionMatch[1])
      if (!state) {
        sendJson(res, 404, { error: 'Not Found', message: '会话不存在或不属于当前账号' })
        return
      }
      sendJson(res, 200, state)
      return
    }

    // 提交答案（幂等）：客户端只提交答案，正确率由服务端判定
    const answerMatch = pathname.match(/^\/api\/study\/sessions\/([A-Za-z0-9-]+)\/answers$/)
    if (req.method === 'POST' && answerMatch) {
      const body = await readJson(req)
      const result = await recordAnswer(accountIdOf(req), answerMatch[1], {
        exerciseId: body.exerciseId,
        submitted: body.submitted,
        idempotencyKey: body.idempotencyKey,
      })
      if (!result.ok) {
        const status = result.code === 'session-not-found' ? 404 : 400
        sendJson(res, status, { error: result.code, message: result.message })
        return
      }
      sendJson(res, 200, result)
      return
    }

    // 完成会话：零题拒绝；重复完成幂等
    const completeMatch = pathname.match(/^\/api\/study\/sessions\/([A-Za-z0-9-]+)\/complete$/)
    if (req.method === 'POST' && completeMatch) {
      const result = await completeStudySession(accountIdOf(req), completeMatch[1])
      if (!result.ok) {
        const status = result.code === 'session-not-found' ? 404 : 400
        sendJson(res, status, { error: result.code, message: result.message })
        return
      }
      sendJson(res, 200, result)
      return
    }

    // P3-2.1 反馈与受控更新：状态机 + 写前日志恢复协议。
    // 同一 (accountId, sessionId) 只允许一次有效处理：
    //   completed → 直接返回缓存结果（幂等，绝不重复改画像/路径）；
    //   processing（未超时）→ 409 处理中；
    //   failed / 超时 → 接管重试，按持久化意图对账，每个子更新最多生效一次。
    const feedbackMatch = pathname.match(/^\/api\/study\/sessions\/([A-Za-z0-9-]+)\/feedback$/)
    if (req.method === 'POST' && feedbackMatch) {
      const accountId = accountIdOf(req)
      const sessionId = feedbackMatch[1]

      const claim = await claimFeedback(accountId, sessionId)
      if (claim.status === 'completed') {
        // 幂等：返回首次处理缓存的结果
        sendJson(res, 200, { ...(claim.result || {}), idempotent: true })
        return
      }
      if (claim.status === 'in-progress') {
        sendJson(res, 409, { error: 'feedback-in-progress', message: '该会话的反馈正在处理中，请稍后重试' })
        return
      }

      const state = await getStudySession(accountId, sessionId)
      if (!state) {
        await mutateFeedback(accountId, sessionId, record => ({
          ...record,
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: 'session-not-found',
        }))
        sendJson(res, 404, { error: 'Not Found', message: '会话不存在或不属于当前账号' })
        return
      }
      if (state.session.status !== 'completed') {
        await mutateFeedback(accountId, sessionId, record => ({
          ...record,
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: 'session-not-completed',
        }))
        sendJson(res, 400, { error: 'session-not-completed', message: '会话尚未完成，不能生成反馈' })
        return
      }

      const attempts = state.attempts
      // 权威评分：只读已保存的 AnswerSubmission，LLM 无权修改
      const assessment = summarizeAttempts(attempts)
      const wrongItems = buildWrongItems(attempts, findExercise)

      try {
        // 步骤 0：AI 反馈（不持有任何事务；失败只影响 feedback，不影响评分）
        const feedback = await generateStudyFeedback({ assessment, wrongItems })

        // 步骤 1：画像更新（写前日志：先持久化意图，再落库）
        let profileUpdate
        const record = (await getFeedbackState(accountId, sessionId)) || { steps: claim.steps, profileAfterValues: null, pendingRevision: null, partial: {} }
        if (record.steps?.profile !== 'done') {
          const prepared = await prepareProfileUpdate({ accountId, session: state.session, attempts })
          if (prepared.applied) {
            // 恢复对账：当前画像已等于意图目标值 → 上次写入已生效，跳过落库
            const currentProfile = await getLatestProfileResult(accountId)
            const alreadyApplied = record.profileAfterValues
              && Object.entries(record.profileAfterValues).every(([label, value]) => {
                const dimension = currentProfile?.dimensions?.find(item => item.label === label)
                return dimension && Number(dimension.value) === Number(value)
              })
            if (alreadyApplied) {
              profileUpdate = {
                applied: true,
                reason: '恢复对账：上次更新已生效，不重复应用',
                changes: prepared.changes,
                reconciled: true,
              }
            } else {
              // 意图先落盘（崩溃后可对账），再执行唯一写操作
              await mutateFeedback(accountId, sessionId, r => ({
                ...r,
                profileAfterValues: prepared.profileAfter,
                pendingRevision: prepared.revision,
              }))
              await commitProfileUpdate(accountId, prepared.nextProfile)
              const { nextProfile, ...rest } = prepared
              profileUpdate = rest
            }
          } else {
            profileUpdate = prepared
          }
          await mutateFeedback(accountId, sessionId, r => ({
            ...r,
            steps: { ...r.steps, profile: 'done' },
            partial: { ...(r.partial || {}), profileUpdate },
          }))
        } else {
          profileUpdate = record.partial?.profileUpdate || { applied: false, reason: '该步骤已在之前尝试中处理', changes: [] }
        }

        // 步骤 2：修订账本（对账补齐：画像已写但账本缺失的中间态在此恢复）
        if (record.steps?.revision !== 'done') {
          const existingRevisions = await listProfileRevisions(accountId, 20)
          const hasRevision = existingRevisions.some(item => item.sessionId === sessionId)
          const pendingRevision = record.pendingRevision || (profileUpdate.applied && profileUpdate.revision ? profileUpdate.revision : null)
          if (!hasRevision && pendingRevision) {
            await saveProfileRevision(accountId, pendingRevision)
          }
          await mutateFeedback(accountId, sessionId, r => ({ ...r, steps: { ...r.steps, revision: 'done' } }))
        }

        // 步骤 3：路径更新（同样的写前日志协议）
        let pathUpdate
        const record2 = (await getFeedbackState(accountId, sessionId)) || { steps: claim.steps, pathVersionAfter: null, partial: {} }
        if (record2.steps?.path !== 'done') {
          const prepared = await preparePathUpdate({ accountId, session: state.session, attempts })
          if (prepared.applied) {
            const currentPath = await getLatestKnowledgePath(accountId)
            const alreadyApplied = record2.pathVersionAfter && (Number(currentPath?.version) || 1) >= record2.pathVersionAfter
            if (alreadyApplied) {
              pathUpdate = {
                applied: true,
                reason: '恢复对账：上次路径更新已生效，不重复应用',
                version: Number(currentPath.version),
                reconciled: true,
              }
            } else {
              await mutateFeedback(accountId, sessionId, r => ({ ...r, pathVersionAfter: prepared.version }))
              await commitPathUpdate(accountId, prepared.nextPath)
              const { nextPath, ...rest } = prepared
              pathUpdate = rest
            }
          } else {
            pathUpdate = prepared
          }
          await mutateFeedback(accountId, sessionId, r => ({
            ...r,
            steps: { ...r.steps, path: 'done' },
            partial: { ...(r.partial || {}), pathUpdate },
          }))
        } else {
          pathUpdate = record2.partial?.pathUpdate || { applied: false, reason: '该步骤已在之前尝试中处理' }
        }

        const result = { assessment, feedback, profileUpdate, pathUpdate, rules: UPDATE_RULES }
        await mutateFeedback(accountId, sessionId, r => ({
          ...r,
          status: 'completed',
          finishedAt: new Date().toISOString(),
          result,
          error: null,
        }))
        sendJson(res, 200, result)
      } catch (error) {
        // 可恢复失败：记录状态，允许后续重试（重试时按意图对账）
        console.error('[feedback] 处理失败:', error)
        await mutateFeedback(accountId, sessionId, r => ({
          ...r,
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: error?.message || '反馈处理失败',
        }))
        sendJson(res, 500, { error: 'Internal Error', message: '反馈处理失败，可重试' })
      }
      return
    }

    // 账号学习统计（真实完成事件，按账号时区计算学习日）
    if (req.method === 'GET' && pathname === '/api/study/stats') {
      sendJson(res, 200, await getStudyStats(accountIdOf(req)))
      return
    }

    // 学习事件账本（审计用）
    if (req.method === 'GET' && pathname === '/api/study/events') {
      sendJson(res, 200, { items: await listLearningEvents(accountIdOf(req), 50) })
      return
    }

    // 画像修订账本（证据来源可追溯）
    if (req.method === 'GET' && pathname === '/api/study/revisions') {
      sendJson(res, 200, { items: await listProfileRevisions(accountIdOf(req), 20) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/learning-cycles/update') {
      // P3-0 证据边界（旧版演示闭环）：
      // - 忽略客户端提交的 profile：画像只能来自服务端按账号存储的记录，
      //   防止客户端伪造基线给自己刷分；
      // - exerciseResults 视为「未核验的演示输入」：返回的闭环结果仅用于
      //   演示智能体协作流程，标记 evidence='unverified'，
      //   **不写入真实画像与学习成绩**；
      // - 真实学习闭环走 P3-1 的 /api/study/* 事件接口（服务端判分）。
      const body = await readJson(req)
      const accountId = accountIdOf(req)
      const profile = await getLatestProfileResult(accountId)
      if (!profile) {
        sendJson(res, 400, { error: 'Bad Request', message: '缺少可更新的学生画像。' })
        return
      }
      const learningHistory = summarizeLearningHistory(await getLearningCycleHistory(accountId))
      const result = await orchestrateLearningUpdate({
        profile,
        currentPath: body.currentPath,
        learningData: body.learningData,
        exerciseResults: body.exerciseResults,
        learningHistory,
      })
      // 旧演示闭环：只保存带未核验标记的闭环记录，不持久化画像变化
      await saveLearningCycle(accountId, {
        ...result,
        evidence: 'unverified-client-input',
      })
      sendJson(res, 200, {
        ...result,
        evidence: 'unverified-client-input',
        verified: false,
        notice: '演示闭环：结果未经真实作答核验，未写入真实画像与学习成绩。',
      })
      return
    }

    if (req.method === 'GET' && pathname === '/api/agent-collaboration') {
      const day = searchParams.get('day') || 'monday'
      // 产品边界：系统演示数据（全局模板）+ 当前账号自己的真实活动，互不串台
      const data = await getCollaborationForDay(day, accountIdOf(req))
      sendJson(res, 200, data)
      return
    }

    if (req.method === 'GET' && pathname === '/api/agent-collaboration/days') {
      sendJson(res, 200, { days: listDays() })
      return
    }

    if (req.method === 'POST' && pathname === '/api/agent-collaboration/seed') {
      // 共享演示数据的写操作要求管理员角色（普通登录用户即可触发是不合理的）
      if (req.session?.role !== 'admin') {
        sendJson(res, 403, { error: 'Forbidden', message: '只有管理员可以重置协作演示数据。' })
        return
      }
      await seedAllDays(saveCollaboration)
      sendJson(res, 200, { ok: true, days: listDays() })
      return
    }

    notFound(res)
  }

  try {
    // 认证中间件：公开路径之外一律要求有效会话；业务路由在账号上下文内执行，
    // 使 orchestrator / recorder 的深层调用无需改签名即可归属到当前账号。
    if (pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(pathname)) {
      const session = getSession(extractToken(req))
      if (!session) {
        sendJson(res, 401, { error: 'Unauthorized', message: '登录状态无效或已过期，请重新登录。' })
        return
      }
      req.session = session
      await runWithAccount(session.account, routeApi)
      return
    }
    await routeApi()
  } catch (error) {
    const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 500
    sendJson(res, statusCode, {
      error: statusCode === 413 ? 'Payload Too Large' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

server.listen(PORT, async () => {
  try {
    if (!(await hasAnyCollaboration())) {
      await seedAllDays(saveCollaboration)
      console.log(`[agent-collaboration] seeded 7 days into ${getStorageBackend()}`)
    }
    // 协作看板改为「演示数据 + 当前账号真实活动」按请求实时合并，
    // 不再启动全局 sync、不再注册 trace hook（消除未处理 Promise rejection 风险）。
    console.log(`API server listening on http://localhost:${PORT}`)
  } catch (error) {
    console.error('[mysql] initialization failed:', error)
    server.close(() => process.exitCode = 1)
  }
})
