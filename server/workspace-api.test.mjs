import test from 'node:test'
import assert from 'node:assert/strict'
import { withTestServer } from './test-server.mjs'
process.env.LLM_API_KEY = ''

async function accounts(helpers) {
  const login = async (account,password) => ({ Authorization: `Bearer ${(await (await helpers.post('/api/auth/login',{ account,password,role:'student' })).json()).token}` })
  return { a: await login('reviewer','Zhixue2026!'), b: await login('student','student123') }
}
function pdfFixture() {
  const content = 'BT /F1 12 Tf 30 100 Td (Linear algebra studies vector spaces and linear maps.) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]
  let out = '%PDF-1.4\n', offsets = [0]
  objects.forEach((object,i) => { offsets.push(Buffer.byteLength(out)); out += `${i+1} 0 obj\n${object}\nendobj\n` })
  const start = Buffer.byteLength(out)
  out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(out).toString('base64')
}
test('workspace authentication, goal validation, memory switches and account ownership', async () => {
  await withTestServer(async h => {
    const {a,b} = await accounts(h)
    assert.equal((await h.get('/api/workspace')).status,401)
    assert.equal((await h.post('/api/workspace/goals',{title:'wrong',dailyMinutes:-1},{headers:a})).status,400)
    assert.equal((await h.post('/api/workspace/goals',{title:'wrong',dailyMinutes:25,deadline:'2026-99-99'},{headers:a})).status,400)
    const goal = (await (await h.post('/api/workspace/goals',{title:'线性代数复习',dailyMinutes:25,deadline:'2026-12-20',accountId:'student'},{headers:a})).json()).result
    assert.ok(goal.id)
    assert.equal((await (await h.get('/api/workspace',{headers:b})).json()).goals.length,0)
    assert.equal((await h.post('/api/workspace/goals',{id:goal.id,title:'overwrite',dailyMinutes:25},{headers:b})).status,404)
    assert.equal((await (await h.get('/api/workspace',{headers:a})).json()).memories.length,1)
    await h.post('/api/workspace/preferences',{memoryEnabled:false},{headers:a})
    assert.equal((await h.post('/api/workspace/memories',{content:'should not save'},{headers:a})).status,409)
    await h.post('/api/workspace/goals',{title:'第二个目标',dailyMinutes:15},{headers:a})
    assert.equal((await (await h.get('/api/workspace',{headers:a})).json()).memories.length,1)
    const exported = await (await h.get('/api/workspace/export',{headers:a})).json()
    assert.equal(exported.workspace.goals.length,2)
    assert.equal(JSON.stringify(exported).includes('password'),false)
  })
})
test('private text/PDF sources retain original citations and reject spoofed files and foreign sources', async () => {
  await withTestServer(async h => {
    const {a,b} = await accounts(h)
    const source = (await (await h.post('/api/workspace/materials',{title:'向量空间讲义',kind:'text',content:'线性代数研究向量空间。\n\n线性映射保持加法和数乘。',tags:'线代,课程'},{headers:a})).json()).result
    assert.equal(source.sections.length,2)
    const answer = await (await h.post('/api/workspace/ask',{question:'线性映射',materialIds:[source.id]},{headers:a})).json()
    assert.equal(answer.source,'extractive')
    assert.ok(answer.citations.some(c=>c.text==='线性映射保持加法和数乘。' && c.paragraph===2))
    assert.equal((await h.post('/api/workspace/ask',{question:'线性映射',materialIds:[source.id]},{headers:b})).status,404)
    assert.equal((await (await h.post('/api/workspace/ask',{question:'火星探测器轨道'},{headers:a})).json()).citations.length,0)
    assert.equal((await h.post('/api/workspace/materials',{title:'fake.pdf',kind:'pdf',data:Buffer.from('not a PDF').toString('base64')},{headers:a})).status,400)
    const response = await h.post('/api/workspace/materials',{title:'Linear algebra.pdf',kind:'pdf',data:pdfFixture()},{headers:a})
    assert.equal(response.status,200)
    const pdf = (await response.json()).result
    assert.equal(pdf.status,'ready',pdf.message)
    assert.ok(pdf.sections.some(s=>s.page===1 && s.text.includes('vector spaces')))
  })
})
test('agent requires explicit confirmation, returns traceable rule artifact, supports cancellation and deletion propagation', async () => {
  await withTestServer(async h => {
    const {a,b} = await accounts(h)
    const material = (await (await h.post('/api/workspace/materials',{title:'私有讲义',content:'这是用于核对来源的一段私有原文。',kind:'text'},{headers:a})).json()).result
    const task = (await (await h.post('/api/workspace/tasks',{prompt:'整理我的讲义',kind:'materials',materialIds:[material.id]},{headers:a})).json()).result
    assert.equal(task.status,'preview')
    assert.equal(task.artifacts.length,0)
    assert.equal((await h.post(`/api/workspace/tasks/${task.id}/confirm`,{},{headers:b})).status,404)
    const cancelled = (await (await h.post(`/api/workspace/tasks/${task.id}/cancel`,{},{headers:a})).json()).result
    assert.equal(cancelled.status,'cancelled')
    const done = (await (await h.post(`/api/workspace/tasks/${task.id}/retry`,{},{headers:a})).json()).result
    assert.equal(done.status,'completed')
    assert.equal(done.source,'rule')
    assert.match(done.artifacts[0].content,/这是用于核对来源的一段私有原文/)
    assert.equal(done.artifacts[0].citations[0].materialId,material.id)
    const repeat = (await (await h.post(`/api/workspace/tasks/${task.id}/confirm`,{},{headers:a})).json()).result
    assert.equal(repeat.artifacts[0].id,done.artifacts[0].id)
    await h.post('/api/workspace/notes',{title:'来源笔记',content:'摘录',materialId:material.id},{headers:a})
    assert.equal((await h.post(`/api/workspace/materials/${material.id}`,{action:'delete'},{headers:b})).status,404)
    await h.post(`/api/workspace/materials/${material.id}`,{action:'delete'},{headers:a})
    const after = await (await h.get('/api/workspace',{headers:a})).json()
    assert.equal(after.materials.length,0)
    assert.equal(after.notes.length,0)
    assert.equal(after.tasks[0].artifacts.length,0)
  })
})
test('focus timing is server authoritative and wrong reviews cannot be forged', async () => {
  await withTestServer(async h => {
    const {a,b} = await accounts(h)
    const timer = (await (await h.post('/api/workspace/focus',{action:'start',minutes:25,accumulatedSeconds:99999},{headers:a})).json()).result
    assert.equal(timer.accumulatedSeconds,0)
    assert.equal((await h.post('/api/workspace/focus',{action:'finish',id:timer.id},{headers:b})).status,404)
    const repeat = (await (await h.post('/api/workspace/focus',{action:'start',minutes:10},{headers:a})).json()).result
    assert.equal(repeat.id,timer.id)
    await new Promise(resolve=>setTimeout(resolve,1050))
    const paused = (await (await h.post('/api/workspace/focus',{action:'pause',id:timer.id},{headers:a})).json()).result
    assert.ok(paused.accumulatedSeconds>=1 && paused.accumulatedSeconds<20)
    const finish = (await (await h.post('/api/workspace/focus',{action:'finish',id:timer.id},{headers:a})).json()).result
    assert.equal(finish.accumulatedSeconds,paused.accumulatedSeconds)
    assert.equal((await h.post('/api/workspace/reviews',{sessionId:'foreign',exerciseId:'fake',reason:'概念混淆',days:1},{headers:a})).status,404)
    assert.equal((await (await h.get('/api/workspace/reviews',{headers:a})).json()).items.length,0)
  })
})
test('wrong-question reviews come from completed scored sessions and persist user-chosen cause and interval', async () => {
  await withTestServer(async h => {
    const {a,b} = await accounts(h)
    const bank = JSON.parse((await import('node:fs')).readFileSync(new URL('./study/exercise-bank.json',import.meta.url),'utf8'))
    const created = await (await h.post('/api/study/sessions',{topicIds:['f1'],exerciseCount:3},{headers:a})).json()
    for (const exercise of created.exercises) {
      assert.equal(exercise.answer,undefined)
      const answer = bank.exercises.find(item=>item.id===exercise.id).answer
      const response = await h.post(`/api/study/sessions/${created.session.id}/answers`,{exerciseId:exercise.id,submitted:(answer+1)%exercise.choices.length,idempotencyKey:`workspace-wrong-${exercise.id}`},{headers:a})
      assert.equal(response.status,200)
    }
    assert.equal((await (await h.get('/api/workspace/reviews',{headers:a})).json()).items.length,0)
    await h.post(`/api/study/sessions/${created.session.id}/complete`,{},{headers:a})
    const rows = (await (await h.get('/api/workspace/reviews',{headers:a})).json()).items
    assert.equal(rows.length,3)
    assert.equal(typeof rows[0].exercise.answer,'number')
    const response = await h.post('/api/workspace/reviews',{sessionId:created.session.id,exerciseId:rows[0].exercise.id,reason:'概念混淆',days:3},{headers:a})
    assert.equal(response.status,200)
    const saved = (await response.json()).result
    assert.equal(saved.reason,'概念混淆')
    assert.ok(Date.parse(saved.dueAt)>Date.now()+2.9*86400000)
    assert.equal((await (await h.get('/api/workspace/reviews',{headers:b})).json()).items.length,0)
  })
})
const sql = Boolean(process.env.MYSQL_URL || process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE)
test('MySQL workspace row mutations are isolated and serialize concurrent updates', {skip: sql ? false : 'MySQL not configured'}, async () => {
  const {getWorkspace,mutateWorkspace} = await import('./workspace/store.js')
  const {closeMySqlPool} = await import('./store/mysql.js')
  const id = `workspace-test-${process.pid}-${Date.now()}`
  try {
    await mutateWorkspace(id,s=>{s.goals.push({id:'g',title:'test'})})
    await Promise.all(Array.from({length:8},(_,i)=>mutateWorkspace(id,s=>{s.notes.push({id:String(i)})})))
    assert.equal((await getWorkspace(id)).notes.length,8)
    assert.equal((await getWorkspace(id+'other')).goals.length,0)
  } finally {await closeMySqlPool()}
})
