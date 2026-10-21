export type EvaluationLoadState = 'idle' | 'loading' | 'real' | 'demo' | 'no-data' | 'unavailable' | 'error'

export interface EvaluationPolicyInput {
  ok: boolean
  status?: number
  code?: string
  dataSource?: string
  hasData?: boolean
  demoEnabled?: boolean
}

/**
 * Classify the source before any value is allowed into the evaluation view.
 * Demo fixtures are opt-in; a 503 from the server is never treated as data.
 */
export function classifyEvaluationResponse(input: EvaluationPolicyInput): Exclude<EvaluationLoadState, 'idle' | 'loading'> {
  if (input.status === 503 || input.code === 'demo-data-disabled') return 'unavailable'
  if (!input.ok) return 'error'
  if (input.dataSource === 'demo-fixture') return input.demoEnabled ? 'demo' : 'unavailable'
  if (!input.hasData) return 'no-data'
  return 'real'
}

export function isEvaluationDemoEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return String(env?.VITE_EDUMIND_DEMO_MODE || '').trim().toLowerCase() === 'true'
}
