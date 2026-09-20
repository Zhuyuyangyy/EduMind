const LLM_API_URL = process.env.LLM_API_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'generalv3.5'

export function isLlmAvailable() {
  return Boolean(LLM_API_URL && LLM_API_KEY)
}

export function getLlmConfig() {
  return { apiUrl: LLM_API_URL, apiKey: LLM_API_KEY, model: LLM_MODEL }
}

export async function callLlm(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 2048, jsonMode = false } = options
  const timeoutMs = Math.max(100, Number(process.env.LLM_TIMEOUT_MS || 30000))

  if (!isLlmAvailable()) {
    return { content: null, fallbackUsed: true, error: null }
  }

  // A single transient connection failure should not make a complete learning
  // workflow look like it was generated locally. Retry only transport/5xx
  // failures once; 4xx errors are configuration or request errors and should
  // be surfaced immediately.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(LLM_API_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (response.status >= 500 && attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
        return { content: null, fallbackUsed: true, error: `LLM API error ${response.status}: ${errorText}` }
      }

      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content || data?.data?.text || data?.text || data?.answer || null
      return { content, fallbackUsed: false, error: null }
    } catch (error) {
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }
      const causeCode = error?.cause?.code ? ` (${error.cause.code})` : ''
      return { content: null, fallbackUsed: true, error: `${error.message || 'LLM request failed'}${causeCode}` }
    }
  }

  return { content: null, fallbackUsed: true, error: 'LLM request failed after retry' }
}

export function safeParseJson(text) {
  if (!text) return null
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const firstObject = cleaned.indexOf('{')
    const lastObject = cleaned.lastIndexOf('}')
    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(cleaned.slice(firstObject, lastObject + 1))
      } catch {
        // Continue with array extraction below.
      }
    }
    const firstArray = cleaned.indexOf('[')
    const lastArray = cleaned.lastIndexOf(']')
    if (firstArray >= 0 && lastArray > firstArray) {
      try {
        return JSON.parse(cleaned.slice(firstArray, lastArray + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export async function generateStructuredJson({ systemPrompt, userPrompt, schema, fallback, taskType }) {
  const start = Date.now()
  const provider = LLM_API_URL || 'none'
  const model = LLM_MODEL || 'none'

  if (!isLlmAvailable()) {
    return {
      data: typeof fallback === 'function' ? fallback() : fallback,
      provider: 'fallback',
      model: 'fallback',
      fallbackUsed: true,
      durationMs: Date.now() - start,
      rawTextPreview: '(no LLM configured; using fallback)',
    }
  }

  try {
    const result = await callLlm(systemPrompt, userPrompt, { jsonMode: true })
    const rawText = result.content || ''

    if (result.fallbackUsed || result.error) {
      const fallbackData = typeof fallback === 'function' ? fallback() : fallback
      return {
        data: fallbackData,
        provider,
        model,
        fallbackUsed: true,
        durationMs: Date.now() - start,
        rawTextPreview: `(LLM error: ${result.error || 'no content'})`,
      }
    }

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = typeof fallback === 'function' ? fallback() : fallback
      return {
        data: parsed,
        provider,
        model,
        fallbackUsed: true,
        durationMs: Date.now() - start,
        rawTextPreview: rawText.slice(0, 300),
      }
    }

    return {
      data: parsed,
      provider,
      model,
      fallbackUsed: false,
      durationMs: Date.now() - start,
      rawTextPreview: rawText.slice(0, 300),
    }
  } catch (error) {
    const fallbackData = typeof fallback === 'function' ? fallback() : fallback
    return {
      data: fallbackData,
      provider,
      model,
      fallbackUsed: true,
      durationMs: Date.now() - start,
      rawTextPreview: `(LLM error: ${error.message})`,
    }
  }
}
