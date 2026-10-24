export const AGENT_NAMES = {
  PROFILE: 'ProfileAgent',
  RESOURCE: 'ResourceAgent',
  PATH: 'PathAgent',
  TUTOR: 'TutorAgent',
  EVALUATION: 'EvaluationAgent',
  REFLECTION: 'ReflectionAgent',
  KNOWLEDGE_PATH: 'KnowledgePathAgent',
}

export const RESOURCE_TYPES = ['concept', 'example', 'exercise', 'errorTip', 'recommendReason', 'profileEvidence']

export function validateResourceGenerateInput(input) {
  const errors = []
  if (!input || typeof input !== 'object') {
    errors.push('input must be an object')
    return { valid: false, errors }
  }
  const topic = typeof input.topic === 'string' ? input.topic.trim() : ''
  const resourceType = typeof input.resourceType === 'string' ? input.resourceType.trim() : ''
  if (typeof input.topic !== 'string' || topic.length === 0) {
    errors.push('topic is required')
  } else if (input.topic.length > 200) {
    errors.push('topic must be at most 200 characters')
  }
  if (typeof input.resourceType !== 'string' || resourceType.length === 0) {
    errors.push('resourceType is required')
  } else if (input.resourceType.length > 32) {
    errors.push('resourceType must be at most 32 characters')
  }
  return {
    valid: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { value: { ...input, topic, resourceType } } : {}),
  }
}

export function createAgentResult({ agentName, input, output, confidence, evidence, riskFlags, securityRefused, durationMs, status, fallbackUsed }) {
  return {
    agentName,
    inputSummary: summarize(input),
    outputSummary: summarize(output),
    input,
    output,
    confidence: confidence ?? 0.8,
    evidence: evidence || [],
    riskFlags: riskFlags || [],
    securityRefused: securityRefused || false,
    durationMs: durationMs ?? 0,
    status: status || 'completed',
    fallbackUsed: fallbackUsed || false,
  }
}

function summarize(obj) {
  if (!obj) return ''
  if (typeof obj === 'string') return obj.slice(0, 200)
  try {
    const json = JSON.stringify(obj)
    return json.length > 300 ? json.slice(0, 300) + '...' : json
  } catch {
    return String(obj).slice(0, 200)
  }
}
