export const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
export const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const AGENT_DEFS = [
  { id: 'profileCapture', name: '画像采集', role: 'PROFILE-1', color: '#8F7CFF', artSrc: '/homepage/agent-load-profile.png' },
  { id: 'profileDiagnosis', name: '薄弱诊断', role: 'PROFILE-2', color: '#A78BFA', artSrc: '/homepage/agent-load-profile.png' },
  { id: 'pathPlan', name: '路径规划', role: 'PATH-1', color: '#35E0D8', artSrc: '/homepage/agent-load-path.png' },
  { id: 'pathReplan', name: '动态重规划', role: 'PATH-2', color: '#14B8A6', artSrc: '/homepage/agent-load-path.png' },
  { id: 'resourceSearch', name: '资源检索', role: 'RESOURCE-1', color: '#45D483', artSrc: '/homepage/agent-load-resource.png' },
  { id: 'resourceGenerate', name: '资源生成', role: 'RESOURCE-2', color: '#84CC16', artSrc: '/homepage/agent-load-resource.png' },
  { id: 'tutorExplain', name: '讲解辅导', role: 'TUTOR-1', color: '#F0B24A', artSrc: '/homepage/agent-load-tutor.png' },
  { id: 'tutorDialogue', name: '互动答疑', role: 'TUTOR-2', color: '#FB923C', artSrc: '/homepage/agent-load-tutor.png' },
  { id: 'evalQuiz', name: '评估出题', role: 'EVAL-1', color: '#F0586E', artSrc: '/homepage/agent-load-eval.png' },
  { id: 'evalCause', name: '错因分析', role: 'EVAL-2', color: '#EC4899', artSrc: '/homepage/agent-load-eval.png' },
  { id: 'feedbackWrite', name: '反馈回写', role: 'FEEDBACK-1', color: '#3B82F6', artSrc: '/homepage/agent-load-feedback.png' },
  { id: 'reflection', name: '成长复盘', role: 'FEEDBACK-2', color: '#6366F1', artSrc: '/homepage/agent-load-feedback.png' },
]

export const MODULE_DEFS = [
  { id: 'profile-module', name: '画像诊断模块', agentIds: ['profileCapture', 'profileDiagnosis'], baseCount: 2 },
  { id: 'path-module', name: '路径编排模块', agentIds: ['pathPlan', 'pathReplan'], baseCount: 3 },
  { id: 'resource-module', name: '资源生产模块', agentIds: ['resourceSearch', 'resourceGenerate'], baseCount: 3 },
  { id: 'tutor-module', name: '辅导互动模块', agentIds: ['tutorExplain', 'tutorDialogue'], baseCount: 3 },
  { id: 'eval-module', name: '测评分析模块', agentIds: ['evalQuiz', 'evalCause'], baseCount: 3 },
  { id: 'feedback-module', name: '反馈复盘模块', agentIds: ['feedbackWrite', 'reflection'], baseCount: 4 },
]

const CHAIN_TEMPLATES = {
  'profile-module': {
    summaries: ['采集真实学习信号，再识别薄弱知识域。', '晨间画像刷新，定位昨日残留盲点。', '晚自习信号汇总，更新多维画像。'],
    issues: ['学习行为信号分散', '画像向量更新滞后', '新旧薄弱点混淆'],
    outcomes: ['定位 2 个薄弱域', '更新 24 维画像', '识别 3 个风险点'],
  },
  'path-module': {
    summaries: ['规划与重规划协同，把薄弱点落到学习顺序里。', '根据画像重排学习路径优先级。', '结合时间窗动态插入复习节点。'],
    issues: ['当前路径无法补弱', '路径节点过于密集', '复习间隔不合理'],
    outcomes: ['重排课后巩固路径', '插入 3 个补弱节点', '缩短进阶前置条件'],
  },
  'resource-module': {
    summaries: ['检索候选资源，再生成适配画像的学习材料。', '针对薄弱点匹配多模态资源。', '结合偏好生成个性练习包。'],
    issues: ['资源太多且不够贴合', '资源难度跨度大', '缺少图解与代码示例'],
    outcomes: ['生成 5 项个性资源', '命中 12 个高匹配材料', '生成 3 组分层练习'],
  },
  'tutor-module': {
    summaries: ['讲解和追问配合，确认学生是否真正理解。', '围绕错题进行概念重讲与追问。', '生成多轮对话巩固关键概念。'],
    issues: ['概念理解不稳定', '学生提问碎片化', '辅导节奏与画像不匹配'],
    outcomes: ['完成两轮追问确认', '学生连续答对 4 题', '生成 2 个变式讲解'],
  },
  'eval-module': {
    summaries: ['即时测评后归因，产出可回写的证据。', '阶段测评与错因分析联动。', '基于练习结果生成诊断证据。'],
    issues: ['学习效果需要量化', '错题归因单一', '测评覆盖不全面'],
    outcomes: ['阶段测评提升到 82 分', '归类 3 类错因', '产出 5 条回写证据'],
  },
  'feedback-module': {
    summaries: ['回写画像、生成复盘，并触发下一轮路径修正。', '把测评结论反向传播到画像与路径。', '沉淀今日学习成果与明日行动。'],
    issues: ['结果需要沉淀为行动', '反馈链路闭环慢', '复盘缺少数据支撑'],
    outcomes: ['生成下一轮学习计划', '更新画像薄弱向量', '触发明日路径修正'],
  },
}

const DAY_PATH_TEMPLATES = [
  {
    summary: '周一基础夯实路径：从指针与数组核心概念出发，补齐语法根基。',
    issue: '周末遗留的基础概念模糊',
    outcome: '完成指针运算与数组遍历的巩固节点',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '排定基础节点', detail: '周一优先安排指针声明、取址与解引用三小节。' },
      { agent: 'pathReplan', type: 'RP', label: '降低进阶权重', detail: '因基础分低于 70%，将结构体进阶推迟到周三。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请基础资源', detail: '向资源模块请求图解卡片与基础练习题。' },
    ],
  },
  {
    summary: '周二专题突破路径：聚焦递归与分治，训练问题拆解思维。',
    issue: '递归终止条件与递推关系混淆',
    outcome: '完成 4 道递归经典题并形成思路模板',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '插入递归专题', detail: '周二的上课链路以递归拆解与分治框架为核心。' },
      { agent: 'pathReplan', type: 'RP', label: '调慢递归节奏', detail: '根据昨日测评，增加一道汉诺塔可视化例题。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请递归资源', detail: '请求分治动画与递归调用栈图解。' },
    ],
  },
  {
    summary: '周三错题回溯路径：基于周一、周二错题，反向补漏并重构路径。',
    issue: '错题重复出现但缺少针对性训练',
    outcome: '错题相似题正确率由 45% 提升至 78%',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '生成错题路径', detail: '从错题库抽取 6 道相似题组成回溯链路。' },
      { agent: 'pathReplan', type: 'RP', label: '压缩新课比例', detail: '为错题回顾让出 30 分钟时间窗。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请变式资源', detail: '请求错题变式与错因标签匹配材料。' },
    ],
  },
  {
    summary: '周四进阶跃迁路径：引入图论与搜索算法，拓展知识边界。',
    issue: '进阶知识前置条件未补齐',
    outcome: '完成图的邻接表表示与 DFS 基础遍历',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '开启图论节点', detail: '周四路径进入图论入门：邻接矩阵与 DFS。' },
      { agent: 'pathReplan', type: 'RP', label: '前置补全检查', detail: '自动插入队列与栈的复习前置节点。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请图论资源', detail: '请求图论可视化与迷宫搜索例题。' },
    ],
  },
  {
    summary: '周五综合测评路径：整周知识点串联，进行阶段能力评估。',
    issue: '单点掌握好但综合迁移弱',
    outcome: '阶段测评 82 分，识别 2 个综合迁移盲点',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '排定测评路径', detail: '周五上午安排综合测评卷与限时训练。' },
      { agent: 'pathReplan', type: 'RP', label: '调整周末路径', detail: '根据测评结果预排周末补弱与拓展内容。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请测评资源', detail: '请求阶段测评卷与自动评分解析。' },
    ],
  },
  {
    summary: '周六复习巩固路径：构建知识图谱，进行整周内容系统化复盘。',
    issue: '一周知识点分散，缺乏体系化串联',
    outcome: '生成 1 张整周知识图谱并完成 3 轮快速回顾',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '排定复习路径', detail: '周六以知识图谱遍历替代新课学习。' },
      { agent: 'pathReplan', type: 'RP', label: '加入快速回顾', detail: '在每个大节点后插入 5 分钟快速自测。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请复习资源', detail: '请求思维导图与一周错题回顾包。' },
    ],
  },
  {
    summary: '周日下周预习路径：提前接触动态规划，为新周学习建立锚点。',
    issue: '新周知识点陌生，起步阻力大',
    outcome: '完成动态规划思想启蒙与 2 道入门题',
    events: [
      { agent: 'pathPlan', type: 'PL', label: '排定预习节点', detail: '周日安排动态规划思想与斐波那契模型预习。' },
      { agent: 'pathReplan', type: 'RP', label: '降低预习难度', detail: '仅保留思想讲解与 2 道低难度例题。' },
      { agent: 'resourceSearch', type: 'RQ', label: '申请预习资源', detail: '请求动态规划入门视频与练习。' },
    ],
  },
]

const EVENT_TEMPLATES = {
  'profile-module': [
    { agent: 'profileCapture', type: 'PC', label: '采集学习信号', detail: '采集答题、停留时长、偏好和卡顿行为，更新 24 维画像。' },
    { agent: 'profileDiagnosis', type: 'DG', label: '识别指针薄弱', detail: '二级指针传参题正确率仅 41%，标记为薄弱知识域。' },
    { agent: 'profileCapture', type: 'NU', label: '画像进入新轮次', detail: '连续学习 5 天，今日还差 14 分钟达标，准备下一轮协同。' },
  ],
  'path-module': [
    { agent: 'pathPlan', type: 'PL', label: '插入补弱节点', detail: '路径规划在课后巩固阶段插入二级指针专项训练。' },
    { agent: 'pathReplan', type: 'RP', label: '动态重排路径', detail: '根据卡顿强度推迟进阶节点，前置偏导和梯度复习。' },
    { agent: 'resourceSearch', type: 'RQ', label: '发起资源请求', detail: '向资源模块提交薄弱点、偏好和预期掌握度目标。' },
  ],
  'resource-module': [
    { agent: 'resourceSearch', type: 'RS', label: '检索候选资源', detail: '命中 18 个候选材料，按难度、时长和偏好打分。' },
    { agent: 'resourceGenerate', type: 'GN', label: '生成个性资源', detail: '生成思维导图、专项练习和图解卡片共 5 项资源。' },
    { agent: 'tutorExplain', type: 'HF', label: '交给辅导模块', detail: '将资源包转换为可讲解的步骤、例题和追问线索。' },
  ],
  'tutor-module': [
    { agent: 'tutorExplain', type: 'TX', label: '讲解核心概念', detail: '解释二级指针与数组指针的区别，并生成代码示例。' },
    { agent: 'tutorDialogue', type: 'QA', label: '连续追问确认', detail: '根据学生回答生成下一轮追问，确认是否真正理解。' },
    { agent: 'evalQuiz', type: 'EV', label: '请求即时测评', detail: '辅导结束后触发 2 道针对性诊断题。' },
  ],
  'eval-module': [
    { agent: 'evalQuiz', type: 'QZ', label: '阶段测评 82 分', detail: '评估出题智能体验证指针补弱效果。' },
    { agent: 'evalCause', type: 'CA', label: '错因归类', detail: '将错题拆成概念遗漏、步骤跳跃和迁移困难三类原因。' },
    { agent: 'feedbackWrite', type: 'WB', label: '提交回写证据', detail: '把测评结论和错因标签交给反馈模块。' },
  ],
  'feedback-module': [
    { agent: 'feedbackWrite', type: 'FB', label: '反向写入画像', detail: '将测评薄弱点反向传播至画像 24 维向量。' },
    { agent: 'reflection', type: 'RF', label: '生成成长复盘', detail: '沉淀今日成就、风险和明日行动建议。' },
    { agent: 'pathReplan', type: 'RP', label: '触发路径修正', detail: '明日聚焦 4 个反馈盲点，插入思维导图生成节点。' },
    { agent: 'profileCapture', type: 'NU', label: '画像进入新轮次', detail: '连续学习 5 天，今日还差 14 分钟达标，准备下一轮协同。' },
  ],
}

function mulberry32(seed) {
  let t = seed >>> 0
  return function () {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)]
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num))
}

export function generateDailyCollaboration(dayIndex) {
  const dayName = DAY_NAMES[dayIndex]
  const dayLabel = DAY_LABELS[dayIndex]
  const seed = 20260619 + dayIndex * 97
  const rand = mulberry32(seed)

  const startHour = 9
  const endHour = 18
  const totalMinutes = (endHour - startHour) * 60

  const date = new Date()
  const currentDay = date.getDay()
  const diff = dayIndex - ((currentDay + 6) % 7)
  date.setDate(date.getDate() + diff)
  const dateString = date.toISOString().slice(0, 10)

  const chains = MODULE_DEFS.map((mod, modIndex) => {
    const isPathModule = mod.id === 'path-module'
    const dayTemplate = isPathModule ? DAY_PATH_TEMPLATES[dayIndex] : null
    const templates = CHAIN_TEMPLATES[mod.id]

    let eventCount
    let selectedTemplates

    if (isPathModule && dayTemplate) {
      eventCount = dayTemplate.events.length
      selectedTemplates = dayTemplate.events
    } else {
      eventCount = clamp(mod.baseCount + Math.floor(rand() * 3) - 1, 2, 5)
      const eventTemplates = EVENT_TEMPLATES[mod.id]
      selectedTemplates = []
      for (let i = 0; i < eventCount; i++) {
        selectedTemplates.push(eventTemplates[(i + dayIndex) % eventTemplates.length])
      }
    }

    const baseT = startHour * 60 + modIndex * 70 + Math.floor(rand() * 20)
    const events = selectedTemplates.map((tpl, i) => {
      const t = clamp(baseT + i * (12 + Math.floor(rand() * 18)), startHour * 60, endHour * 60 - 1)
      return {
        id: `d${dayIndex}-${mod.id}-${i}`,
        chain: mod.id,
        agent: tpl.agent,
        t,
        type: tpl.type,
        label: tpl.label,
        detail: tpl.detail,
      }
    })

    return {
      id: mod.id,
      name: mod.name,
      summary: isPathModule && dayTemplate ? dayTemplate.summary : pick(templates.summaries, rand),
      issue: isPathModule && dayTemplate ? dayTemplate.issue : pick(templates.issues, rand),
      outcome: isPathModule && dayTemplate ? dayTemplate.outcome : pick(templates.outcomes, rand),
      eventIds: events.map(e => e.id),
      events,
    }
  })

  const events = chains.flatMap(chain => chain.events)
  const modules = MODULE_DEFS.map(mod => {
    const chain = chains.find(c => c.id === mod.id)
    return {
      id: `${mod.id}-card`,
      chainId: mod.id,
      name: mod.name,
      agentNames: mod.agentIds.map(id => AGENT_DEFS.find(a => a.id === id).name),
      color: AGENT_DEFS.find(a => a.id === mod.agentIds[0]).color,
      artSrc: AGENT_DEFS.find(a => a.id === mod.agentIds[0]).artSrc,
      eventCount: chain.events.length,
    }
  })

  return {
    dayOfWeek: dayIndex,
    dayName,
    dayLabel,
    dateString,
    totalAgents: AGENT_DEFS.length,
    totalEvents: events.length,
    totalChains: chains.length,
    agents: AGENT_DEFS,
    chains: chains.map(({ events: _, ...rest }) => rest),
    events,
    modules,
  }
}

export async function seedAllDays(storeFn) {
  for (let i = 0; i < 7; i++) {
    const payload = generateDailyCollaboration(i)
    await storeFn(DAY_NAMES[i], payload)
  }
}
