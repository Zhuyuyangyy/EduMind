import { LOCAL_KNOWLEDGE_DOCUMENTS } from './documents.js'

const DIMENSIONS = 96
const MODEL_NAME = 'local-hash-embedding-v1'
const MODE_WEIGHTS = {
  keyword: { vector: 0, tag: 0, keyword: 1 },
  vector: { vector: 1, tag: 0, keyword: 0 },
  'vector-keyword': { vector: 0.7, tag: 0, keyword: 0.3 },
  hybrid: { vector: 0.5, tag: 0.3, keyword: 0.2 },
}
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'what', 'when', 'where', 'which', 'with',
  'should', 'please',
])

function hashToken(token) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function tokenize(text) {
  const normalized = String(text || '').toLowerCase()
  const words = normalized.match(/[a-z0-9_+#.-]+|[\u4e00-\u9fff]/g) || []
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,}/g) || []
  const bigrams = cjk.flatMap(item => {
    const tokens = []
    for (let index = 0; index < item.length - 1; index += 1) {
      tokens.push(item.slice(index, index + 2))
    }
    return tokens
  })
  return [...words, ...bigrams].filter(Boolean)
}

function embedText(text) {
  const vector = new Array(DIMENSIONS).fill(0)
  const tokens = tokenize(text)

  for (const token of tokens) {
    const hash = hashToken(token)
    const index = hash % DIMENSIONS
    const sign = hash & 1 ? 1 : -1
    vector[index] += sign * (1 + Math.min(token.length, 8) / 8)
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map(value => value / norm)
}

function cosineSimilarity(left, right) {
  let score = 0
  for (let index = 0; index < DIMENSIONS; index += 1) {
    score += left[index] * right[index]
  }
  return score
}

function normalizedTokens(text) {
  return new Set(tokenize(text).filter(token => token.length > 1 && !STOP_WORDS.has(token)))
}

function overlapScore(queryTokens, candidateTokens, cap = 4) {
  if (queryTokens.size === 0) return 0
  let matches = 0
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) matches += 1
  }
  return Math.min(1, matches / Math.min(queryTokens.size, cap))
}

function documentText(document) {
  return [
    document.title,
    document.type,
    document.tags?.join(' '),
    document.summary,
    document.content,
    document.agentHint,
  ].filter(Boolean).join('\n')
}

const VECTOR_INDEX = LOCAL_KNOWLEDGE_DOCUMENTS.map(document => ({
  document,
  embedding: embedText(documentText(document)),
}))

function buildQuery({ query, profile, learningData, exerciseResults }) {
  const dimensions = Array.isArray(profile?.dimensions)
    ? profile.dimensions.map(item => `${item.label || item.key || ''} ${item.value ?? ''}`).join(' ')
    : ''
  const weaknesses = Array.isArray(profile?.weaknesses)
    ? profile.weaknesses.map(item => `${item.tag || item.label || ''} ${item.count ?? ''}`).join(' ')
    : ''

  return [
    query,
    dimensions,
    weaknesses,
    JSON.stringify(learningData || {}),
    JSON.stringify(exerciseResults || {}),
  ].filter(Boolean).join('\n')
}

export function searchKnowledgeBase({ query, profile, learningData, exerciseResults, limit = 4, mode = 'hybrid', weights } = {}) {
  const finalQuery = buildQuery({ query, profile, learningData, exerciseResults })
  const queryEmbedding = embedText(finalQuery || 'evaluation profile learning weakness')
  const queryTokens = normalizedTokens(finalQuery)
  const selectedMode = Object.hasOwn(MODE_WEIGHTS, mode) ? mode : 'hybrid'
  const selectedWeights = weights || MODE_WEIGHTS[selectedMode]
  const matches = VECTOR_INDEX
    .map(({ document, embedding }) => {
      const vector = Math.max(0, cosineSimilarity(queryEmbedding, embedding))
      const tag = overlapScore(queryTokens, normalizedTokens(document.tags?.join(' ') || ''), 3)
      const keyword = overlapScore(queryTokens, normalizedTokens(documentText(document)), 6)
      const score = selectedWeights.vector * vector + selectedWeights.tag * tag + selectedWeights.keyword * keyword
      return {
        id: document.id,
        domain: document.domain,
        source: document.source,
        title: document.title,
        type: document.type,
        tags: document.tags,
        summary: document.summary,
        agentHint: document.agentHint,
        score: Number(score.toFixed(4)),
        scores: {
          vector: Number(vector.toFixed(4)),
          tag: Number(tag.toFixed(4)),
          keyword: Number(keyword.toFixed(4)),
        },
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 4, VECTOR_INDEX.length)))

  const evidenceScore = matches.length
    ? Math.max(matches[0].scores.tag, matches[0].scores.keyword)
    : 0

  return {
    query: finalQuery,
    matches,
    outOfKnowledgeBase: evidenceScore < 0.1,
    retrieval: {
      mode: selectedMode,
      weights: selectedWeights,
      evidenceThreshold: 0.1,
    },
    embedding: {
      model: MODEL_NAME,
      dimensions: DIMENSIONS,
      indexSize: VECTOR_INDEX.length,
      generatedAt: new Date().toISOString(),
    },
  }
}

export function getKnowledgeBaseStats() {
  const localDocuments = LOCAL_KNOWLEDGE_DOCUMENTS.filter(item => item.source === 'local').length
  const vectorDocuments = LOCAL_KNOWLEDGE_DOCUMENTS.length

  return {
    model: MODEL_NAME,
    dimensions: DIMENSIONS,
    localDocuments,
    vectorDocuments,
    chunks: vectorDocuments,
    domains: new Set(LOCAL_KNOWLEDGE_DOCUMENTS.map(item => item.domain)).size,
    syncedAgents: ['EvaluationAgent', 'PathAgent', 'ReflectionAgent'],
    updatedAt: new Date().toISOString(),
  }
}
