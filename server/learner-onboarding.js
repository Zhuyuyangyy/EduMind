const choices = {
  role: ['student', 'professional', 'freelancer', 'other'],
  field: ['cs', 'data-science', 'ai', 'software-eng', 'other'],
  level: ['beginner', 'intermediate', 'advanced', 'expert'],
  shortTermGoal: ['skill', 'project', 'exam', 'other'],
  weeklyHours: ['less-than-5', '5-10', '10-20', 'more-than-20'],
  resourcePreference: ['video', 'reading', 'practice', 'project'],
}
export function normalizeOnboarding(body) {
  if (!body || !['completed', 'skipped'].includes(body.status) || !body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return null
  const answers = {}
  for (const [key, values] of Object.entries(choices)) {
    const value = body.answers[key]
    if (value !== undefined && value !== '') {
      if (!values.includes(value)) return null
      answers[key] = value
    }
    if (body.status === 'completed' && !answers[key]) return null
  }
  for (const key of ['customField', 'shortTermDetail']) {
    const value = body.answers[key]
    if (value !== undefined && (typeof value !== 'string' || value.length > 600)) return null
    if (value) answers[key] = value.trim()
  }
  if (body.status === 'completed' && answers.field === 'other' && !answers.customField) return null
  return { version: 1, status: body.status, answers, updatedAt: new Date().toISOString() }
}
