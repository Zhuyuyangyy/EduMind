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
  orchestrateResourceGeneration,
  orchestratePathReplan,
  orchestrateTutoring,
  orchestrateFullEvaluation,
  orchestrateFullRun,
  orchestrateKnowledgePath,
  orchestrateLearningUpdate,
  runResourceGeneration,
} from './agents/orchestrator.js'
import { getTraces, getTraceSummary, buildTrace, recordTrace, setTraceRecordedHook } from './evidence/recorder.js'
import { validateResourceGenerateInput } from './schemas.js'
import { isLlmAvailable, getLlmConfig } from './llm/provider.js'
import { getKnowledgeBaseStats, searchKnowledgeBase } from './knowledge-base/vector-store.js'
import { getAccountSettings, getLatestLearningCycle, getLearningCycleHistory, getStorageBackend, saveAccountSettings, saveLearningCycle } from './store/mysql.js'
import { summarizeLearningHistory } from './learner-memory.js'
import {
  getCollaborationByDay,
  saveCollaboration,
  listDays,
  hasAnyCollaboration,
} from './store/agent-collaboration.js'
import { generateDailyCollaboration, seedAllDays } from './collaboration-data.js'
import { syncTracesToCollaboration, getCollaborationForDay } from './collaboration-sync.js'

const PORT = Number(process.env.PORT || 8788)
const MAX_BODY_SIZE = 1024 * 1024

function getAccountId(body = {}, searchParams) {
  const value = body.accountId || body.userAccount || searchParams?.get('accountId') || 'default'
  return String(value).trim() || 'default'
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    })
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const { pathname, searchParams } = url

  try {
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
      sendJson(res, 200, {
        account,
        role,
        displayName: role === 'admin' ? '演示管理员' : '评审体验账号',
      })
      return
    }

    if (req.method === 'GET' && pathname === '/api/account/settings') {
      sendJson(res, 200, { result: await getAccountSettings(getAccountId({}, searchParams)) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/account/settings') {
      const body = await readJson(req)
      const displayName = String(body.displayName || '').trim()
      if (!displayName || displayName.length > 64) {
        sendJson(res, 400, { error: 'Bad Request', message: '用户名长度应为 1 到 64 个字符。' })
        return
      }
      sendJson(res, 200, { result: await saveAccountSettings(getAccountId(body), { displayName }) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/run') {
      const body = await readJson(req)
      const accountId = getAccountId(body)
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
      sendJson(res, 200, { items: getTraces(limit, offset) })
      return
    }

    if (req.method === 'GET' && pathname === '/api/evidence/summary') {
      sendJson(res, 200, getTraceSummary())
      return
    }

    if (req.method === 'POST' && pathname === '/api/profile/analyze') {
      const body = await readJson(req)
      const agentResult = await orchestrateProfileAnalysis(body)
      await saveProfileResult(agentResult.profile, getAccountId(body))
      sendJson(res, 200, agentResult.profile)
      return
    }

    if (req.method === 'GET' && pathname === '/api/profile/latest') {
      sendJson(res, 200, { result: await getLatestProfileResult(getAccountId({}, searchParams)) })
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
        await saveProfileResult(profile, getAccountId(body))
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
      await saveProfileResult(profile, getAccountId(body))
      sendJson(res, 200, profile)
      return
    }

    // AI 智能体生成个性化知识路径
    if (req.method === 'POST' && pathname === '/api/knowledge-path/generate') {
      const body = await readJson(req)
      const profile = body.profile || await getLatestProfileResult(getAccountId(body)) || {}
      const result = await orchestrateKnowledgePath({ profile })
      saveKnowledgePathResult(result.knowledgePath)
      sendJson(res, 200, result.knowledgePath)
      return
    }

    // 获取已生成的知识路径
    if (req.method === 'GET' && pathname === '/api/knowledge-path/latest') {
      const kp = getLatestKnowledgePath()
      sendJson(res, 200, { result: kp })
      return
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const body = await readJson(req)
      const isDialoguePayload = Array.isArray(body.messages)
      const message = isDialoguePayload ? latestUserMessage(body.messages) : String(body.message || '').trim()
      const reply = await buildChatReplyAsync(message, body.multimodalContents)
      saveChatHistoryEntry(message, reply, body.multimodalContents)
      const chatTrace = buildTrace({
        requestId: `chat-${Date.now()}`,
        agents: ['ChatAgent'],
        inputsSummary: `消息: ${String(message || '').slice(0, 80)}`,
        outputsSummary: `回复: ${String(reply.content || '').slice(0, 80)}`,
        evidence: ['本地规则生成对话回复'],
        riskFlags: [],
        fallbackUsed: true,
        durationMs: 0,
        agentResults: [],
      })
      recordTrace(chatTrace)
      sendJson(res, 200, isDialoguePayload ? toDialogueChatReply(reply) : reply)
      return
    }

    if (req.method === 'GET' && pathname === '/api/chat/history') {
      sendJson(res, 200, { items: getChatHistory() })
      return
    }

    if (req.method === 'POST' && pathname === '/api/tutoring/ask') {
      const body = await readJson(req)
      if (!String(body.question || '').trim()) {
        sendJson(res, 400, { error: 'Bad Request', message: '学习问题不能为空。' })
        return
      }
      const profile = await getLatestProfileResult(getAccountId(body)) || {}
      const agentResult = await orchestrateTutoring({
        question: body.question,
        mode: body.mode,
        profile,
        resources: [],
      })
      const answer = agentResult.answer
      saveTutoringHistoryEntry({
        question: String(body.question || '').trim() || '未提供问题',
        answer,
        mode: body.mode || 'qa',
        scenario: body.scenario || 'preview',
        multimodalContents: body.multimodalContents || [],
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
      sendJson(res, 200, { items: getTutoringHistory() })
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
      const profile = body.profile || await getLatestProfileResult(getAccountId(body)) || {}
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

    if (req.method === 'POST' && pathname === '/api/resources/generate') {
      const body = await readJson(req)
      const validation = validateResourceGenerateInput(body)
      if (!validation.valid) {
        sendJson(res, 400, { error: 'Bad Request', details: validation.errors })
        return
      }
      const profile = body.profile || await getLatestProfileResult(getAccountId(body)) || {}
      const weaknesses = body.weaknesses || profile.weaknesses || []
      const result = await orchestrateResourceGeneration({
        profile,
        weaknesses,
        topic: body.topic,
        resourceType: body.resourceType,
      })
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/profile') {
      const body = await readJson(req)
      const result = await orchestrateProfileAnalysis(body)
      await saveProfileResult(result.profile, getAccountId(body))
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && pathname === '/api/agents/path-replan') {
      const body = await readJson(req)
      const profile = body.profile || await getLatestProfileResult(getAccountId(body)) || {}
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
      const accountId = getAccountId(body)
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
      const profile = body.profile || await getLatestProfileResult(getAccountId(body)) || {}
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
      sendJson(res, 200, { result: await getLatestLearningCycle(getAccountId({}, searchParams)) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/learning-cycles/update') {
      const body = await readJson(req)
      const accountId = getAccountId(body)
      const profile = body.profile || await getLatestProfileResult(accountId)
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
      await saveProfileResult(result.profile, accountId)
      await saveLearningCycle(accountId, result)
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'GET' && pathname === '/api/evidence/traces') {
      const limit = Number(searchParams.get('limit') || 50)
      const offset = Number(searchParams.get('offset') || 0)
      const traces = getTraces(limit, offset)
      sendJson(res, 200, { items: traces, total: traces.length })
      return
    }

    if (req.method === 'GET' && pathname === '/api/evidence/summary') {
      const summary = getTraceSummary()
      sendJson(res, 200, { ...summary, llmAvailable: isLlmAvailable() })
      return
    }

    if (req.method === 'GET' && pathname === '/api/agent-collaboration') {
      const day = searchParams.get('day') || 'monday'
      let data = await getCollaborationForDay(day)
      if (!data) {
        data = await getCollaborationByDay(day)
      }
      if (!data) {
        const { index } = (await import('./store/agent-collaboration.js')).resolveDay(day)
        const payload = generateDailyCollaboration(index)
        data = await saveCollaboration(day, payload)
      }
      sendJson(res, 200, data)
      return
    }

    if (req.method === 'GET' && pathname === '/api/agent-collaboration/days') {
      sendJson(res, 200, { days: listDays() })
      return
    }

    if (req.method === 'POST' && pathname === '/api/agent-collaboration/seed') {
      await seedAllDays(saveCollaboration)
      sendJson(res, 200, { ok: true, days: listDays() })
      return
    }

    notFound(res)
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
    await syncTracesToCollaboration()
    setTraceRecordedHook(() => { void syncTracesToCollaboration() })
    console.log(`API server listening on http://localhost:${PORT}`)
  } catch (error) {
    console.error('[mysql] initialization failed:', error)
    server.close(() => process.exitCode = 1)
  }
})
