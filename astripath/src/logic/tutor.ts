/**
 * AI 导师 · 演示模式知识库检索
 *
 * 重要声明（界面同步展示）：演示模式下回答来自预置课程知识库的确定性检索匹配，
 * 不是实时大模型调用。检索算法参考原智学星枢工程的关键词融合检索思路，
 * 采用可解释的词项加权匹配：命中关键词/标题权重高，命中正文权重低，
 * 低于阈值时明确返回「未命中」并列出可问范围，不编造答案。
 */
import { knowledgeBase, kbByKp } from '../data/knowledgeBase.ts'
import { exercises } from '../data/exercises.ts'
import { getKp } from '../data/course.ts'
import type { KbCard } from './types.ts'

export interface TutorResponse {
  /** 固定为 demo：明确告知这是演示模式检索，而非实时模型 */
  mode: 'demo'
  matched: boolean
  kpId: string | null
  kpName: string | null
  title: string
  answer: string
  example: string | null
  pitfalls: string[]
  /** 引用依据（课程资料出处） */
  source: string | null
  relatedExercises: Array<{ id: string; prompt: string }>
  followUps: string[]
  /** 本次检索命中的词项（向用户展示检索过程，保证可解释） */
  matchedTerms: string[]
}

const MATCH_THRESHOLD = 4
const WEIGHT = { keyword: 3, title: 3, kpName: 2, concept: 1 }

/** 简单分词：中文按二元滑窗，英文数字按词边界（演示用途，无外部依赖） */
export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ')
  const tokens: string[] = []
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  for (const segment of cjk) {
    for (let i = 0; i < segment.length - 1; i++) {
      tokens.push(segment.slice(i, i + 2))
    }
    if (segment.length <= 3) tokens.push(segment)
  }
  const latin = normalized.match(/[a-z0-9_+#.]{2,}/g) ?? []
  tokens.push(...latin)
  return [...new Set(tokens)]
}

/** 问候/客套类意图：不检索知识库，直接回应 */
const SMALL_TALK = /^(你好|您好|hi|hello|嗨|谢谢|感谢|thanks|thank you|再见|bye)[!！。.\s]*$/i

function smallTalkReply(): TutorResponse {
  return {
    mode: 'demo',
    matched: false,
    kpId: null,
    kpName: null,
    title: '演示模式 AI 导师',
    answer:
      '你好，我是智学星枢演示版 AI 导师。我可以基于《Python 数据分析基础》预置课程知识库回答该课程相关问题，' +
      '并针对你的薄弱知识点给出讲解、示例与练习推荐。试试问我「什么是广播」或点击下方推荐问题。',
    example: null,
    pitfalls: [],
    source: null,
    relatedExercises: [],
    followUps: ['什么是广播？', '缺失值应该删除还是填充？', 'merge 和 concat 的区别？'],
    matchedTerms: []
  }
}

function cardResponse(card: KbCard, matchedTerms: string[]): TutorResponse {
  const kp = getKp(card.kpId)
  const relatedExercises = card.relatedExercises
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .map((e) => ({ id: e.id, prompt: e.prompt }))
  return {
    mode: 'demo',
    matched: true,
    kpId: card.kpId,
    kpName: kp.name,
    title: card.title,
    answer: card.concept,
    example: card.example,
    pitfalls: card.pitfalls,
    source: card.source,
    relatedExercises,
    followUps: card.followUps,
    matchedTerms
  }
}

function fallbackResponse(): TutorResponse {
  return {
    mode: 'demo',
    matched: false,
    kpId: null,
    kpName: null,
    title: '未在演示知识库中命中',
    answer:
      '这个问题超出了当前演示课程（Python 数据分析基础）预置知识库的覆盖范围。' +
      '演示模式下我只能基于内置课程材料回答，不会凭空生成答案。你可以换一个与本课程相关的问题，或点击下方推荐问题。',
    example: null,
    pitfalls: [],
    source: null,
    relatedExercises: [],
    followUps: ['什么是广播？', 'loc 和 iloc 的区别？', '缺失值应该删除还是填充？', 'merge 后行数变多怎么办？'],
    matchedTerms: []
  }
}

/** 检索演示知识库并生成回答（确定性） */
export function answerQuestion(question: string): TutorResponse {
  const trimmed = question.trim()
  if (trimmed.length === 0) return fallbackResponse()
  if (SMALL_TALK.test(trimmed)) return smallTalkReply()

  const lowerQuery = trimmed.toLowerCase()
  const tokens = tokenize(trimmed)
  if (tokens.length === 0) return fallbackResponse()

  let best: { card: KbCard; score: number; terms: string[] } | null = null

  for (const card of knowledgeBase) {
    const kpName = getKp(card.kpId).name
    const lowerTitle = card.title.toLowerCase()
    const lowerKpName = kpName.toLowerCase()
    const lowerConcept = card.concept.toLowerCase()
    let score = 0
    const terms: string[] = []

    // 关键词整体命中查询（权重最高，如 "广播"、"缺失值"）
    for (const keyword of card.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        score += WEIGHT.keyword
        terms.push(keyword)
      }
    }
    // 词项命中标题 / 知识点名 / 正文
    for (const token of tokens) {
      if (lowerTitle.includes(token)) {
        score += WEIGHT.title
        terms.push(token)
      } else if (lowerKpName.includes(token)) {
        score += WEIGHT.kpName
        terms.push(token)
      } else if (lowerConcept.includes(token)) {
        score += WEIGHT.concept
        terms.push(token)
      }
    }

    if (!best || score > best.score) best = { card, score, terms: [...new Set(terms)] }
  }

  if (!best || best.score < MATCH_THRESHOLD) return fallbackResponse()
  return cardResponse(best.card, best.terms)
}

/** 针对薄弱知识点生成推荐问题（供导师页快捷提问） */
export function suggestedQuestions(weakKpIds: string[]): string[] {
  const questions: string[] = []
  for (const kpId of weakKpIds.slice(0, 3)) {
    const card = kbByKp[kpId]
    if (!card) continue
    const q = card.followUps[0]
    if (q && !questions.includes(q)) questions.push(q)
  }
  if (questions.length === 0) {
    questions.push('什么是广播？', '缺失值应该删除还是填充？', 'merge 和 concat 的区别？')
  }
  return questions
}

/** 导师页可问范围（知识库覆盖的知识点） */
export function coveredTopics(): string[] {
  return knowledgeBase.map((card) => getKp(card.kpId).name)
}
