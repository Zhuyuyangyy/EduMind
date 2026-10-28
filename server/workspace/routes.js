import { randomUUID } from 'node:crypto'
import { getWorkspace, mutateWorkspace, createGoal, createMaterial, askSources, previewTask, executeTask, deleteMaterial, text, find, invalid, now, sectionsFromText, capacity } from './service.js'

export async function workspaceRoute({ req, res, pathname, searchParams, account, readJson, sendJson, listLearningEvents, getStudySession, findExercise, getStudyStats }) {
  if (!pathname.startsWith('/api/workspace')) return false
  const send = result => { sendJson(res, 200, result); return true }
  const body = async () => readJson(req, pathname === '/api/workspace/materials' ? 8 * 1024 * 1024 : 1024 * 1024)
  if (pathname === '/api/workspace' && req.method === 'GET') {
    const state = await getWorkspace(account)
    const events = await listLearningEvents(account, 100)
    const sessions = []
    for (const event of events) {
      if (!event.sessionId || sessions.some(s => s.id === event.sessionId)) continue
      const record = await getStudySession(account, event.sessionId)
      if (record) sessions.push({ ...record.session, answered: record.attempts.length })
      if (sessions.length >= 10) break
    }
    return send({ ...state, tasks: state.tasks.map(({ runToken, ...task }) => task), sessions })
  }
  if (pathname === '/api/workspace/goals' && req.method === 'POST') return send({ result: await createGoal(account, await body()) })
  if (pathname === '/api/workspace/materials' && req.method === 'POST') return send({ result: await createMaterial(account, await body()) })
  if (pathname === '/api/workspace/ask' && req.method === 'POST') return send(await askSources(account, await body()))
  if (pathname === '/api/workspace/tasks' && req.method === 'POST') return send({ result: await previewTask(account, await body()) })
  const actionMatch = pathname.match(/^\/api\/workspace\/tasks\/([^/]+)\/(confirm|retry|cancel)$/)
  if (actionMatch && req.method === 'POST') return send({ result: await executeTask(account, actionMatch[1], actionMatch[2]) })
  const materialMatch = pathname.match(/^\/api\/workspace\/materials\/([^/]+)$/)
  if (materialMatch && req.method === 'POST') {
    const input = await body()
    if (input.action === 'delete') return send(await deleteMaterial(account, materialMatch[1]))
    const content = text(input.content, 120000, true)
    return send({ result: await mutateWorkspace(account, state => { const item = find(state.materials, materialMatch[1]); item.sections = sectionsFromText(content); item.status = 'ready'; item.message = '手动转录已保存，引用来自这些段落。'; item.updatedAt = now(); return item }) })
  }
  if (pathname === '/api/workspace/notes' && req.method === 'POST') {
    const input = await body()
    return send({ result: await mutateWorkspace(account, state => {
      if (input.materialId) find(state.materials, input.materialId)
      if (input.action === 'delete') { find(state.notes, input.id); state.notes = state.notes.filter(n => n.id !== input.id); return { deleted: true } }
      const previous = input.id ? find(state.notes, input.id) : null
      if (!previous) capacity(state.notes)
      const note = { id: previous?.id || randomUUID(), title: text(input.title, 160, true), content: text(input.content, 30000, true), materialId: input.materialId || null, updatedAt: now() }
      if (previous) Object.assign(previous, note); else state.notes.unshift(note)
      return note
    }) })
  }
  if (pathname === '/api/workspace/preferences' && req.method === 'POST') {
    const input = await body()
    return send({ result: await mutateWorkspace(account, state => {
      for (const key of ['memoryEnabled', 'reminderEnabled']) if (input[key] !== undefined) { if (typeof input[key] !== 'boolean') invalid('开关值无效。'); state.preferences[key] = input[key] }
      for (const key of ['reminderTime', 'quietStart', 'quietEnd']) if (input[key] !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input[key])) invalid('时间格式无效。'); state.preferences[key] = input[key] }
      return state.preferences
    }) })
  }
  if (pathname === '/api/workspace/memories' && req.method === 'POST') {
    const input = await body()
    return send({ result: await mutateWorkspace(account, state => {
      if (input.action === 'clear') { state.memories = []; state.preferences.memoryEnabled = false; return { cleared: true } }
      if (input.action === 'delete') { find(state.memories, input.id); state.memories = state.memories.filter(m => m.id !== input.id); return { deleted: true } }
      if (!state.preferences.memoryEnabled) invalid('个性化记忆已暂停，请先开启。', 409)
      const old = input.id ? find(state.memories, input.id) : null
      if (!old) capacity(state.memories, 40)
      const memory = { id: old?.id || randomUUID(), type: 'preference', content: text(input.content, 600, true), source: '用户手动填写', updatedAt: now() }
      if (old) Object.assign(old, memory); else state.memories.unshift(memory)
      return memory
    }) })
  }
  if (pathname === '/api/workspace/focus' && req.method === 'POST') {
    const input = await body()
    return send({ result: await mutateWorkspace(account, state => {
      if (input.action === 'start') {
        const current = state.focus.find(item => ['running', 'paused'].includes(item.status))
        if (current) return current
        const minutes = Number(input.minutes)
        if (![10,15,25,45].includes(minutes)) invalid('请选择支持的专注时长。')
        if (input.goalId) find(state.goals, input.goalId)
        capacity(state.focus, 300)
        const focus = { id: randomUUID(), goalId: input.goalId || null, minutes, accumulatedSeconds: 0, status: 'running', startedAt: now(), resumedAt: now(), finishedAt: null }
        state.focus.unshift(focus); return focus
      }
      const item = find(state.focus, input.id)
      if (item.status === 'completed') return item
      if (!['pause','resume','finish'].includes(input.action)) invalid('计时操作无效。')
      if (item.status === 'running') item.accumulatedSeconds = Math.min(item.minutes * 60, item.accumulatedSeconds + Math.max(0, Math.floor((Date.now() - Date.parse(item.resumedAt)) / 1000)))
      item.status = input.action === 'resume' ? 'running' : input.action === 'pause' ? 'paused' : 'completed'
      if (input.action === 'resume') item.resumedAt = now()
      if (input.action === 'finish') item.finishedAt = now()
      return item
    }) })
  }
  if (pathname === '/api/workspace/reviews' && req.method === 'GET') {
    const events = await listLearningEvents(account, 500)
    const state = await getWorkspace(account)
    const ids = [...new Set(events.map(e => e.sessionId).filter(Boolean))]
    const rows = new Map()
    for (const id of ids.slice(0, 100)) {
      const record = await getStudySession(account, id)
      if (!record || record.session.status !== 'completed') continue
      for (const attempt of record.attempts) {
        const exercise = record.snapshot?.find(e => e.id === attempt.exerciseId) || findExercise(attempt.exerciseId)
        if (!exercise) continue
        const old = rows.get(attempt.exerciseId)
        if (!old || Date.parse(attempt.submittedAt) > Date.parse(old.attempt.submittedAt)) rows.set(attempt.exerciseId, { exercise, attempt, sessionId: id })
      }
    }
    return send({ items: [...rows.values()].filter(row => !row.attempt.correct).map(row => ({ ...row, review: state.reviews.find(review => review.exerciseId === row.exercise.id) || null })) })
  }
  if (pathname === '/api/workspace/reviews' && req.method === 'POST') {
    const input = await body()
    const record = await getStudySession(account, input.sessionId)
    if (!record || record.session.status !== 'completed' || !record.attempts.some(a => a.exerciseId === input.exerciseId && !a.correct)) invalid('没有此账号已完成的错题记录。', 404)
    if (!['概念缺失', '概念混淆', '步骤错误', '读题疏漏', '记忆提取失败', '题目有争议'].includes(input.reason)) invalid('请选择错因。')
    const days = Number(input.days)
    if (![1,3,7,14].includes(days)) invalid('请选择复习间隔。')
    return send({ result: await mutateWorkspace(account, state => {
      const old = state.reviews.find(item => item.exerciseId === input.exerciseId)
      if (!old) capacity(state.reviews, 300)
      const review = { id: old?.id || randomUUID(), exerciseId: input.exerciseId, sessionId: input.sessionId, reason: input.reason, dueAt: new Date(Date.now() + days * 86400000).toISOString(), updatedAt: now() }
      if (old) Object.assign(old, review); else state.reviews.push(review)
      return review
    }) })
  }
  if (pathname === '/api/workspace/checklist' && req.method === 'POST') {
    const input = await body()
    return send({ result: await mutateWorkspace(account, state => { const task = find(state.tasks, input.taskId); const item = find(task.checklist || [], input.id); if (typeof input.done !== 'boolean') invalid('完成状态无效。'); item.done = input.done; item.updatedAt = now(); return item }) })
  }
  if (pathname === '/api/workspace/export' && req.method === 'GET') {
    const state = await getWorkspace(account)
    return send({ exportedAt: now(), scope: '学习工作区与已完成练习统计', workspace: state, studyStats: await getStudyStats(account) })
  }
  if (pathname === '/api/workspace/feedback' && req.method === 'POST') {
    const input = await body()
    return send({ result: await mutateWorkspace(account, state => { capacity(state.feedback); const item = { id: randomUUID(), content: text(input.content, 2000, true), status: 'received', createdAt: now() }; state.feedback.unshift(item); return item }) })
  }
  invalid('此工作区操作不存在。', 404)
}
