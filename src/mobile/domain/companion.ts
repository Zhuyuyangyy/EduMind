export type PetKind = 'fox' | 'cat' | 'rabbit' | 'owl'
export type WidgetKind = 'focus' | 'tasks' | 'week' | 'review' | 'library' | 'goals' | 'agent'
export interface WidgetConfig { id: string; kind: WidgetKind; title: string; visible: boolean; goalId: string | null }
export interface Reward { id: string; amount: number; reason: string; at: string }
export interface LocalTaskState { status: 'pending' | 'active' | 'deferred'; updatedAt: string }
export interface LocalConfig {
  version: 1; pet: PetKind; experience: number; food: number; rewards: Reward[]; feeds: Array<{ id: string; pet: PetKind; at: string; amount: number }>;
  widgets: WidgetConfig[]; sloganOffsets: Record<string, number>; favorites: string[];
  taskStates: Record<string, LocalTaskState>; focusLinks: Record<string, { taskId?: string; goalId?: string; materialId?: string; topicId?: string }>;
  uncertain: Record<string, boolean>; completedOnboarding: boolean; theme: 'dark' | 'light'; appearanceRevision?: 2; selfTest?: string;
  vault: Record<string, {path:string;materialId:string;raw:string;title:string;tags:string[];headings:string[];links:string[];frontmatter:Record<string,string>;importedAt:string}>;
}
export const widgetCatalog: Record<WidgetKind, { title: string; source: string; description: string }> = {
  focus: { title: '专注学习', source: '服务器计时会话', description: '从一段安静的时间开始，支持暂停和恢复。' },
  tasks: { title: '新人任务 / 今日任务', source: '账号目标、资料与已确认清单', description: '看清完成条件，知道下一步做什么。' },
  week: { title: '本周学习进度', source: '已结束计时及可读取的练习事件', description: '只呈现已有记录，活动不等于能力提升。' },
  review: { title: '错题与待复习', source: '已完成练习中的真实作答', description: '把卡住的知识点，安排到下一次回忆。' },
  library: { title: '最近的学习资料', source: '当前账号的私有资料库', description: '接着读讲义，从原文继续理解。' },
  goals: { title: '我的长期目标', source: '用户创建的学习目标', description: '查看期限与每天可以投入的时间。' },
  agent: { title: '星枢任务进展', source: '服务器任务状态与产物', description: '查看待确认、执行中和已完成的任务。' },
}
export const defaultWidgets = (): WidgetConfig[] => ['focus','tasks','week'].map(kind => ({ id: `default-${kind}`, kind: kind as WidgetKind, title: widgetCatalog[kind as WidgetKind].title, visible: true, goalId: null }))
export function defaultLocalConfig(): LocalConfig { return { version: 1, pet: 'fox', experience: 0, food: 0, rewards: [], feeds: [], widgets: defaultWidgets(), sloganOffsets: {}, favorites: [], taskStates: {}, focusLinks: {}, uncertain: {}, completedOnboarding: false, theme: 'light', appearanceRevision: 2, vault:{} } }
export function storageScope(origin: string, account: string): string { return `edumind-mobile-ui-v2:${encodeURIComponent(origin)}:${encodeURIComponent(account)}` }
export function validateWidget(value: unknown): value is WidgetConfig {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return Object.keys(item).every(k => ['id','kind','title','visible','goalId'].includes(k)) && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 && typeof item.kind === 'string' && Object.prototype.hasOwnProperty.call(widgetCatalog,item.kind) && typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 40 && typeof item.visible === 'boolean' && (item.goalId === null || typeof item.goalId === 'string' && item.goalId.length <= 100)
}
export function readLocalConfig(raw: string | null): LocalConfig {
  const base = defaultLocalConfig()
  if (!raw) return base
  try {
    const x = JSON.parse(raw)
    if (x.version !== 1) return base
    base.pet = ['fox','cat','rabbit','owl'].includes(x.pet) ? x.pet : 'fox'
    base.experience = Number.isSafeInteger(x.experience) && x.experience >= 0 ? x.experience : 0
    base.food = Number.isSafeInteger(x.food) && x.food >= 0 ? x.food : 0
    base.rewards = Array.isArray(x.rewards) ? x.rewards.filter((r: Reward) => typeof r?.id === 'string' && Number.isInteger(r.amount) && r.amount > 0 && r.amount <= 20 && typeof r.reason === 'string' && Number.isFinite(Date.parse(r.at))) : []
    base.feeds = Array.isArray(x.feeds) ? x.feeds.filter((f: Reward) => typeof f?.id === 'string' && Number.isFinite(Date.parse(f.at))) : []
    base.widgets = Array.isArray(x.widgets) && x.widgets.length <= 12 && x.widgets.every(validateWidget) && new Set(x.widgets.map((w: WidgetConfig) => w.id)).size === x.widgets.length ? x.widgets : defaultWidgets()
    const safeEntries=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.entries(v).filter(([k])=>!['__proto__','constructor','prototype'].includes(k)&&k.length<=120).slice(0,5000):[]
    for(const [key,value]of safeEntries(x.sloganOffsets))if(Number.isSafeInteger(value)&&Number(value)>=0)base.sloganOffsets[key]=Number(value)
    for(const [key,value]of safeEntries(x.uncertain))if(typeof value==='boolean')base.uncertain[key]=value
    for(const [key,value]of safeEntries(x.taskStates)){const v=value as LocalTaskState;if(v&&['pending','active','deferred'].includes(v.status)&&Number.isFinite(Date.parse(v.updatedAt)))base.taskStates[key]={status:v.status,updatedAt:v.updatedAt}}
    for(const [key,value]of safeEntries(x.focusLinks)){if(!value||typeof value!=='object')continue;const v=value as Record<string,unknown>;base.focusLinks[key]=Object.fromEntries(Object.entries(v).filter(([k,v])=>['taskId','goalId','materialId','topicId'].includes(k)&&typeof v==='string'&&v.length<=100))}
    base.favorites = Array.isArray(x.favorites) ? x.favorites.filter((s: unknown) => typeof s === 'string').slice(0,100) : []
    base.completedOnboarding = x.completedOnboarding === true
    base.theme = x.appearanceRevision === 2 && x.theme === 'dark' ? 'dark' : 'light'
    base.appearanceRevision = 2
    if(typeof x.selfTest==='string'&&x.selfTest.length<=30000)base.selfTest=x.selfTest
    for(const [id,item]of safeEntries(x.vault)){const v=item as Record<string,unknown>;if(!v||typeof v.path!=='string'||typeof v.raw!=='string'||v.raw.length>120000||typeof v.materialId!=='string'||typeof v.title!=='string'||typeof v.importedAt!=='string')continue;const strings=(x:unknown)=>Array.isArray(x)?x.filter(s=>typeof s==='string').slice(0,100):[];base.vault[id]={path:v.path,materialId:v.materialId,raw:v.raw,title:v.title,tags:strings(v.tags),headings:strings(v.headings),links:strings(v.links),frontmatter:Object.fromEntries(safeEntries(v.frontmatter).filter(([,v])=>typeof v==='string')) as Record<string,string>,importedAt:v.importedAt}}
    return base
  } catch { return base }
}
export interface CompletionEvidence { id: string; type: 'focus' | 'practice' | 'task'; at: string; seconds?: number; expectedSeconds?: number; confirmedDone?: boolean }
export function grantEvidence(config: LocalConfig, evidence: CompletionEvidence): boolean {
  if (!evidence.id || !Number.isFinite(Date.parse(evidence.at))) return false
  if(evidence.type==='task'&&evidence.confirmedDone!==true)return false
  if (evidence.type === 'focus' && (!Number.isFinite(evidence.expectedSeconds) || evidence.expectedSeconds! <= 0 || !Number.isFinite(evidence.seconds) || evidence.seconds! < 60 || evidence.seconds! < evidence.expectedSeconds! * .8)) return false
  const id = `${evidence.type}:${evidence.id}`
  if (config.rewards.some(item => item.id === id)) return false
  const amount = evidence.type === 'focus' ? 3 : evidence.type==='practice'?2:1
  config.rewards.unshift({ id, amount, reason: evidence.type === 'focus' ? '完成有效专注' : evidence.type==='practice'?'完成服务器练习':'清单自报完成（服务器已保存）', at: evidence.at })
  config.food += amount
  return true
}
export function feedPet(config: LocalConfig, at = new Date().toISOString()): boolean {
  if (config.food < 1) return false
  config.food--; config.experience += 10
  config.feeds.unshift({ id: `feed-${config.feeds.length}-${at}`, pet: config.pet, at, amount: 1 })
  return true
}
export function petProgress(experience: number) { const level = Math.floor(experience / 50) + 1; return { level, current: experience % 50, next: 50, stage: level < 3 ? '初遇' : level < 6 ? '同行' : '领航' } }
export const slogans = ['今天，先把一个问题想明白。','走一小步，也是在向前。','让好奇心，带你走到下一站。','学过之后，再试着回忆一次。','不着急，先从眼前这一点开始。','把不理解的地方，变成今天的起点。','给自己一段安静的学习时间。','你留下的每一条记录，都有意义。','带着问题读，比匆忙读完更重要。','慢慢理解，也能走得很远。']
export function shanghaiDay(at = Date.now()): string { return new Date(at + 8 * 3600000).toISOString().slice(0,10) }
export function dailySlogan(day: string, offset = 0): string { const seed = [...day].reduce((sum,c) => sum + c.charCodeAt(0),0); return slogans[(seed + Math.max(0, Math.floor(offset))) % slogans.length]! }
export function proposeWidget(request: string, goalId: string | null = null): { widget: WidgetConfig; reason: string } {
  const kind: WidgetKind = /错题|复习|提醒/.test(request) ? 'review' : /编程|数学|进度|本周|统计/.test(request) ? 'week' : /资料|讲义|笔记|知识库/.test(request) ? 'library' : /专注|分钟|计时/.test(request) ? 'focus' : /目标|考研|长期/.test(request) ? 'goals' : /执行|Agent|星枢/.test(request) ? 'agent' : 'tasks'
  return { widget: { id: `widget-${Date.now()}`, kind, title: widgetCatalog[kind].title, visible: true, goalId }, reason: `依据关键词，从已验证的「${widgetCatalog[kind].title}」类型中匹配；这是本地规则建议，不是模型调用。` }
}
export interface TimeRecord { id: string; seconds: number; at: string; goalId: string | null }
export function timeBuckets(records: TimeRecord[], days: number, now = Date.now()) {
  const today = shanghaiDay(now)
  const anchor = Date.parse(`${today}T12:00:00+08:00`)
  return Array.from({ length: days }, (_,i) => {
    const key = shanghaiDay(anchor - (days - 1 - i) * 86400000)
    return { day: key, seconds: records.filter(r => shanghaiDay(Date.parse(r.at)) === key).reduce((n,r) => n + Math.max(0,r.seconds),0) }
  })
}
