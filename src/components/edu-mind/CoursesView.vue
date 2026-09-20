<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useTheme } from '../../composables/useEduMindTheme'
import {
  BookOpen,
  Layers,
  GitCompare,
  Brain,
  Eye,
  Shield,
  Target,
  Search,
  ChevronRight,
  Play,
  HelpCircle,
  Code,
  Award,
  Sparkles,
  Send,
  CheckCircle,
  FileText,
  AlertCircle,
  Terminal,
  Activity,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Users,
  Clock,
  Calendar,
  Lock,
  RefreshCw,
  Video,
  ExternalLink,
  ChevronLeft,
  Briefcase
} from 'lucide-vue-next'
import type { CourseItem, KnowledgePoint, CodeSample, PresetQA } from '../../data/edu-mind-course-data'
import { COURSES_DATA } from '../../data/edu-mind-course-data'

const IconMap: Record<string, any> = {
  Code,
  Layers,
  GitCompare,
  Brain,
  Eye,
  Shield,
  Target
}

const emit = defineEmits<{
  addWeeklyHours: [h: number, title: string]
  navigateToTab: [tab: string]
}>()

const { isDark } = useTheme()

const courses = ref<CourseItem[]>((() => {
  const saved = localStorage.getItem('edumind_courses_list')
  if (!saved) return COURSES_DATA
  try {
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : COURSES_DATA
  } catch {
    return COURSES_DATA
  }
})())

const activeDirection = ref<string>('全部')
const difficultyFilter = ref<string>('全部')
const searchQuery = ref<string>('')
const selectedCourse = ref<CourseItem | null>(null)

const activeTab = ref<'syllabus' | 'code' | 'ai-tutor' | 'qa'>('syllabus')

const progressValue = ref<number>(0)

const activeCodeSampleIdx = ref<number>(0)
const terminalOutput = ref<string>('')
const isRunningCode = ref<boolean>(false)

const activeScenario = ref<'preview' | 'inclass' | 'experiment' | 'exam'>('preview')
const chatMessages = ref<{ sender: 'user' | 'bot'; text: string; time: string }[]>([])
const customInput = ref<string>('')
const isTyping = ref<boolean>(false)

const courseWorkspaceTab = ref<string>('课程内容')
const activeLectureId = ref<string>('1.1')
const expandedChapters = reactive<Record<string, boolean>>({
  '01': true,
  '02': false,
  '03': false,
  '04': false,
  '05': false,
})
const lectureDetailTab = ref<'详情' | '笔记' | '问答'>('详情')

const lectureNotes = reactive<Record<string, string[]>>({
  '1.1': ['C语言是面向过程的语言，直接操作内存，性能极高。', '环境搭建需要注意PATH环境变量的配置。'],
  '1.2': ['在C语言里，任何可执行命令都必须包裹在 main 函数大括号内才可以正常执行。']
})
const newLectureNote = ref<string>('')

const starredCourses = reactive<Record<string, boolean>>({
  'prog-c': true
})

const forumPosts = ref([
  { id: 1, author: '程序猿小王', avatar: '🦁', content: '指针和数组在内存大小占用上有什么区别？', replies: 8, time: '2小时前' },
  { id: 2, author: '代码小达人', avatar: '🐼', content: 'C++ 的 RAII 机制真是优雅，极大地防范了 malloc memory leak 可能性。', replies: 14, time: '5小时前' },
  { id: 3, author: '算法菜鸟', avatar: '🐱', content: '求助：在做数据结构大作业时，KMP算法的 next 数组边界常亮红色报错如何调试？', replies: 21, time: '1天前' }
])
const newForumInput = ref<string>('')
const isSyncingProgress = ref<boolean>(false)

watch(courses, (val) => {
  localStorage.setItem('edumind_courses_list', JSON.stringify(val))
}, { deep: true })

watch(selectedCourse, (course) => {
  if (course) {
    progressValue.value = course.progress
    activeTab.value = 'syllabus'
    activeCodeSampleIdx.value = 0
    terminalOutput.value = ''
    isRunningCode.value = false
    resetAITutorChat(course, activeScenario.value)

    courseWorkspaceTab.value = '课程内容'
    activeLectureId.value = '1.1'
    lectureDetailTab.value = '详情'
  }
})

const resetAITutorChat = (course: CourseItem, scenario: string) => {
  let scenarioIntro = ''
  if (scenario === 'preview') {
    scenarioIntro = `你好！我是你的专属 AI 导师。针对《${course.name}》的【课前预习】，你可以点击进行"概念速览"来对基本常识建立框架，也可以通过"案例式科普"激发兴趣。你准备好开始哪一个部分了？`
  } else if (scenario === 'inclass') {
    scenarioIntro = `你好！如果上课听得有些迷茫，没关系。我是你的专属 AI 导师，这里正在支持关于《${course.name}》的"碎片解惑"和"跟不上了"的重新讲解模式。我们可以逐步拆解难点！`
  } else if (scenario === 'experiment') {
    scenarioIntro = `欢迎进入《${course.name}》的【课后实验与实机操练】。在这里我提供"代码纠错"、"Bug调试"以及"标准实验报告撰写模板指导"。有任何具体报错或代码细节，你可以发到这里！`
  } else {
    scenarioIntro = `临近考试或大作业阶段？别慌！我是你的专属 AI 教学助理。我可以帮助你进行《${course.name}》的"高频核心考点梳理"、"精选题型分析"并提供"期末大工程/大作业全周期方案框架设计"。`
  }
  chatMessages.value = [
    { sender: 'bot', text: scenarioIntro, time: '刚刚' }
  ]
}

const handleScenarioChange = (scenario: 'preview' | 'inclass' | 'experiment' | 'exam') => {
  activeScenario.value = scenario
  if (selectedCourse.value) {
    resetAITutorChat(selectedCourse.value, scenario)
  }
}

const handleSaveProgress = () => {
  if (!selectedCourse.value) return
  const updated = courses.value.map(c => {
    if (c.id === selectedCourse.value!.id) {
      return { ...c, progress: progressValue.value }
    }
    return c
  })
  courses.value = updated
  if (selectedCourse.value) {
    selectedCourse.value = { ...selectedCourse.value, progress: progressValue.value }
  }

  const diff = progressValue.value - (selectedCourse.value?.progress || 0)
  if (diff > 0) {
    const addedHours = parseFloat((diff * 0.08).toFixed(1))
    if (addedHours > 0) {
      emit('addWeeklyHours', addedHours, selectedCourse.value!.name)
    }
  }
}

const handleRunCode = (sample: CodeSample) => {
  if (isRunningCode.value) return
  isRunningCode.value = true
  terminalOutput.value = '⚡ [编译器] 正在分配独立的沙箱虚拟机并装载依赖环境...\n⏰ [内核] 准备启动执行流...\n'

  setTimeout(() => {
    terminalOutput.value += `👉 [执行命令]: python run_${selectedCourse.value?.id}.py\n\n`

    setTimeout(() => {
      let executionOutput = ''
      if (selectedCourse.value?.id === 'prog-c') {
        executionOutput = `[运行结果]:\nFibonacci(10) = 55\nx = 10, y = 5\n\n🎉 程序执行完毕，退出码: 0 (正常结束)`
      } else if (selectedCourse.value?.id === 'prog-py') {
        executionOutput = `[运行结果]:\n快速排序排序前: [14, 3, 5, 2, 8]\nquick_sort 耗时: 0.0001s\n快速排序排序后: [2, 3, 5, 8, 14]\n斐波那契生成元组前10项为: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n\n🎉 程序执行完毕，退出码: 0 (正常结束)`
      } else if (selectedCourse.value?.id === 'prog-java') {
        executionOutput = `[运行结果]:\nForkJoinPool.commonPool-worker-1: Java OOP 基础\nForkJoinPool.commonPool-worker-2: 高并发应用架构开发\n过滤对应难度[进阶]课程完毕，已成功在并行处理链内响应线程！\n\n🎉 JVM 正常终结进程退出`
      } else if (selectedCourse.value?.id === 'prog-cpp') {
        executionOutput = `[运行结果]:\n[RAII] 正在打开文件: course_syllabus.txt\n文件读写指针成功实例化。\n[析构函数触发]: 自动安全拆除文件指针指针 & 归还全局内存！\n\n🎉 进程正常结束`
      } else if (selectedCourse.value?.id === 'prog-ds') {
        executionOutput = `[运行结果]:\n主文案检测: 'A B A C A B A B D'\n查找子串: 'A B A B'\n[KMP算法编译分析]: LPS前后缀特征集构建为: [0, 0, 1, 2]\n匹配成功！首次出现在主串位置索引: 4\n\n🎉 执行耗时: 3ms`
      } else if (selectedCourse.value?.id === 'prog-algorithm') {
        executionOutput = `[运行结果]:\n[0-1背包解题矩阵输出]:\n最大价值为: 10\n选中填充物品索引集为: [1, 2]\n\n🎉 计算复杂度完美符合 O(N*W)`
      } else if (selectedCourse.value?.id === 'prog-compiler') {
        executionOutput = `[运行结果]:\n正在解析解析表达式: '3 + 5 * (2 + 4)'\n[词法分析生成流]: NUMBER(3), PLUS(+), NUMBER(5), STAR(*), L_PAREN((), NUMBER(2), PLUS(+), NUMBER(4), R_PAREN())\n[递归下降法推导开始]...\n解析返回运算结果: 33\n\n🎉 编译节点无语法错误，结束。`
      } else if (selectedCourse.value?.id === 'ai-ml') {
        executionOutput = `[运行结果]:\n[KNN分类器训练]: 装载鸢尾花训练数据集 120 条样本...\n测试新测试用本: [5.0, 3.2] 和 [6.0, 3.1]\n计算得出欧式最近邻标签...\n预测分类结果分别为: [0 (Setosa), 1 (Versicolor)]\n测试集整体评价评估得分: 0.9667\n[PyTorch神经网络]: Epoch 0 MSELoss: 0.8543, Epoch 1 MSELoss: 0.4218, Epoch 2 MSELoss: 0.1287`
      } else if (selectedCourse.value?.id === 'ai-dl') {
        executionOutput = `[运行结果]:\n[NumPy单层反向传播]:\n实例化 Layer (10x64), 初始化参数高斯化分布完毕\n前向传播完成、激活ReLU后非奇异值激活...\n输出形状为: (1, 64)\n\n🎉 训练参数链更新完毕`
      } else if (selectedCourse.value?.id === 'ai-nlp') {
        executionOutput = `[运行结果]:\n[注意力常数缩放求证]:\nQ K 矩阵点乘向量夹角相乘: [12.5, 4.3, 8.2]\n除以标准根号分母(8)后拉回温和区间。\nSoftmax权重分配为: [0.65, 0.10, 0.25]\n加权得出最终隐状态表征完成。`
      } else if (selectedCourse.value?.id === 'ai-rl') {
        executionOutput = `[运行结果]:\n[马尔可夫时序更新]:\n智能体进入电网寻宝状态...\n初始化随机权值 weights (5x3)\n与动作空间交互，DQN触发贝尔曼时差误差校零...\nTD Error = -0.0418\n第 121 个 Step 迭代收敛。`
      } else if (selectedCourse.value?.id === 'app-bigdata') {
        executionOutput = `[运行结果]:\n[MapReduce并流计算引擎开启]:\nMap任务分块并词拆分映射发射中...\nSHUFFLE洗牌将同键(hello)聚集...\nReduce聚合结果输出:\n- hello: 2\n- world: 2\n- mapreduce: 1\n- powerful: 1`
      } else {
        executionOutput = `[运行结果]:\n程序开始运行...\n实例化对象，正在读取数据...\n循环运行成功完毕。\n计算最终评估指标符合学术标准。\n结果: OK\n\n🎉 正常退出`
      }

      terminalOutput.value += executionOutput
      isRunningCode.value = false
    }, 1000)
  }, 1200)
}

const getSimulatedAIAnyReply = (course: CourseItem, scenario: string, subMode: string) => {
  let detailMsg = ''
  if (scenario === 'preview') {
    if (subMode.includes('概念')) {
      detailMsg = `### 📖 《${course.name}》概念速览\n\n本门课程在${course.category}大方向里属于顶梁支柱，它的核心是为了解决：如何设计一套合理的算法和软件逻辑使计算机资源发挥最大效用。为了入门这门课：\n\n1. 请先掌握其核心概念：**${course.knowledgePoints[0]?.concept || '基本结构'}** (${course.knowledgePoints[0]?.description || '基础认知'})。\n2. 进一步攻克关键拦路虎：**${course.knowledgePoints[2]?.concept || '高阶精髓'}**。\n3. 先修建议是 **${course.preRequisite}**，学习周期累计需要 **${course.studyHours} 个标准学时**。\n\n别担心，点击在【核心程序代码】里运行一段最简单的逻辑可以让我们直观感触它的魔力！`
    } else {
      detailMsg = `### 🌟 《${course.name}》生活案例式科普\n\n觉得本章节抽象？别急。让我们用一个生活中的案例来理解：\n\nImagine 我们要把《${course.name}》中提到的 **${course.knowledgePoints[1]?.concept || '核心机制'}** 解释一个外行人听：\n- 这就像是你去超市买菜，你要从上万种搭配中找出营养和性价比最高的几种。如果漫无目的逐一查看，大脑会崩溃；这就是我们需要 **${course.knowledgePoints[2]?.concept || '更强算法'}** 去建立规则（比如在数据库中的多级索引，在AI中的主特征PCA轴线降维）的原因。\n\n所以，这并不是纯粹的代码堆砌，它是一套严密优雅的"减熵系统"。你明白了这背后的趣味逻辑了吗？`
    }
  } else if (scenario === 'inclass') {
    if (subMode.includes('碎片')) {
      detailMsg = `### 💡 针对《${course.name}》的碎片难点快速解惑\n\n你是否有哪个具体的变量、机制或者函数卡住了？来，给你一个一分钟弄懂的简短笔记：\n\n- **问**: ${course.presetQA[0]?.question || '核心难点如何理解？'}\n- **答**: ${course.presetQA[0]?.answer || '别着急，逐步查看它的核心定义，多在本地修改并打印输出比对状态即可打通。'}\n\n哪里还有不太理解的点，直接在下方输入我来为你实时拆解！`
    } else {
      detailMsg = `### 🧠 怎么也"跟不上"这一章了？没关系，我们来降维重启！\n\n老师讲得太快、太学究对不对？来，我们回到最简单的起点，《${course.name}》的难关大概在：**${course.knowledgePoints[Math.min(2, course.knowledgePoints.length-1)]?.concept || '进阶逻辑'}**。\n\n我们把这事分 3 步来走：\n1. **忘掉高阶词汇**: 回到最简单的单条输入/输出分析；\n2. **动手模拟**: 用纸笔把数据走向推导一遍，如单链表遍历指针移动，残差连接相加等；\n3. **小步尝试**: 把【核心程序代码】里的代码稍微修改一行，观察输出的变化。\n\n你觉得这 3 步哪一步我们最该开始？我们现在就来一起做！`
    }
  } else if (scenario === 'experiment') {
    if (subMode.includes('辅导') || subMode.includes('调试')) {
      detailMsg = `### 🛠️ 实验代码辅导与 Debug 诊疗\n\n写实验代码遇到离奇报错了？通常在《${course.name}》的实验课里，有以下高低频巨坑：\n\n1. **资源不释放**: ${course.id.startsWith('prog') ? '指针、文件句柄、或者JVM未及时释放导致死锁/溢出。记得采用RAII、try-with-resources或智能指针。' : '训练梯度溢出或数据通道阻塞。注意合理的Batch Size大小与归一化防护。'}\n2. **越界与判空**: 在实现核心 **${course.knowledgePoints[0]?.concept || '数据处理'}** 时，没有做前置的安全哨兵过滤，导致指针/索引在边界崩溃。\n\n你现在遇到了什么具体 Error 信息？复制粘贴发在下方，我来帮你逐行纠错诊断！`
    } else {
      detailMsg = `### 📝 《${course.name}》标准实验报告撰写骨架\n\n为你自动生成一份最完美的课程实验报告骨架模板，包含了格式、逻辑要求，快快收藏：\n\n\`\`\`markdown\n# 课程实验报告：${course.name} 探索与核心应用\n\n## 一、实验目的与背景\n- 深度验证并掌握 ${course.knowledgePoints[0]?.concept} 的基本特性\n- 研透并手写实现 ${course.knowledgePoints[1]?.concept || '核心设计'} 的运作流模式\n\n## 二、实验原理说简明\n1. 原理推导与架构核心...\n2. 时间/空间复杂度分析...\n\n## 三、实验代码架构设计\n- 给出关键类设计(如 class / struct) 以及核心函数签名的说明...\n\n## 四、实验数据及仿真结果\n- (在此区域贴上我们【运行程序】输出的真实终端日志，证明正常结束)...\n\n## 五、实验思考与分析总结\n- 回答课后思考题：比如 ${course.presetQA[0]?.question || '如何优化它的性能？'}\n- 实验过程中的核心 Bug 如何通过增加边界值防护解决...\n\`\`\``
    }
  } else {
    if (subMode.includes('考点')) {
      detailMsg = `### 🎯 《${course.name}》考前必背：核心考点高密梳理\n\n别慌！这是教研组为你筛理出的期末考试【高频核心必考点】，赶紧记下来：\n\n- **必背点 1**: **${course.knowledgePoints[0]?.concept}** 的核心定义与基本操作，常考选择/填空题。\n- **必背点 2**: **${course.knowledgePoints[2]?.concept || '进阶机制'}** 的时空复杂度推导、算法缺陷和改进，常考大题和分析题。\n- **分析重点**: 结合课本后最经典的问答题：*"${course.presetQA[0]?.question}"*，重点看答案里关于原理性的底层剖析。\n\n把这几个点弄透，考评拿优没有问题！`
    } else if (subMode.includes('题型')) {
      detailMsg = `### 🧩 《${course.name}》典型大题与经典笔试真题精解\n\n**【真题还原】**: 实现或优化一个包含 **${course.knowledgePoints[1]?.concept || '核心应用'}** 的实际任务。\n- **核心陷阱**: 往往涉及边界条件、内存泄漏释放或参数维度不匹配的问题等。\n- **满分解法三大底气**:\n  1. 写明前置定义和状态初始化；\n  2. 给出状态转移方程或时空流拓扑模型；\n  3. 细化退出哨兵保护机制。`
    } else {
      detailMsg = `### 🏗️ 期末终极大作业 (Project) 全周期通盘指导\n\n大作业不知道如何下手，甚至不知道要做一个什么？针对《${course.name}》给你定制两个拿优等的高级大项目选题：\n\n- **选题 A (实用工程派)**: 基于 **${course.knowledgePoints[0]?.concept}** 与 **${course.knowledgePoints[1]?.concept}** 实现一个可视化的简易多终端演示平台（如可视化寻路器/轻量级编译器IDE仿真/机器学习控制面板）。\n- **选题 B (前沿探索者)**: 把课程所讲的原理运用于当前热门的 AGI 背景中：\n  - *例如*: 设计一个能针对课程内 *${course.presetQA[0]?.question || '某个难点'}* 自动排版出标准图谱并进行自愈更新的服务框架！\n\n如果你敲定了其中一个，随时在这里发"我选选题A，求具体的开发技术栈建议"，我来帮你分步规划。`
    }
  }
  return detailMsg
}

const handleAIPresetClick = (subLabel: string) => {
  if (!selectedCourse.value || isTyping.value) return

  const userMsg = { sender: 'user' as const, text: `我需要对本门课程进行【${subLabel}】的专属辅导`, time: '刚刚' }
  chatMessages.value = [...chatMessages.value, userMsg]
  isTyping.value = true

  setTimeout(() => {
    const botReplyText = getSimulatedAIAnyReply(selectedCourse.value!, activeScenario.value, subLabel)
    chatMessages.value = [...chatMessages.value, { sender: 'bot' as const, text: botReplyText, time: '刚刚' }]
    isTyping.value = false
  }, 1000)
}

const handleCustomSend = () => {
  if (!customInput.value.trim() || !selectedCourse.value || isTyping.value) return
  const inputVal = customInput.value
  chatMessages.value = [...chatMessages.value, { sender: 'user' as const, text: inputVal, time: '刚刚' }]
  customInput.value = ''
  isTyping.value = true

  setTimeout(() => {
    const course = selectedCourse.value!
    let botText = `收到你的具体咨询："${inputVal}"！\n\n关于本课程《${course.name}》的特征，建议优先结合 **${course.knowledgePoints[0]?.concept}** (例如 ${course.knowledgePoints[0]?.description})。在实际编写代码或考试时：\n\n1. 注意基本的数据边界防护。\n2. 深入探讨时可以查阅 ${course.name} 内置的标准预设标准问答 (QA)。\n3. 如果是关于报错，可以把具体堆栈细节发这里，我协助你排查！`
    chatMessages.value = [...chatMessages.value, { sender: 'bot' as const, text: botText, time: '刚刚' }]
    isTyping.value = false
  }, 1200)
}

const filteredCourses = computed(() => {
  return courses.value.filter(course => {
    const matchesDirection = activeDirection.value === '全部' || course.category === activeDirection.value
    const matchesDifficulty = difficultyFilter.value === '全部' || course.difficulty === difficultyFilter.value
    const normalizedKeyword = searchQuery.value.trim().toLowerCase()
    const matchesSearch = !normalizedKeyword ||
      course.name.toLowerCase().includes(normalizedKeyword) ||
      course.description.toLowerCase().includes(normalizedKeyword)
    return matchesDirection && matchesDifficulty && matchesSearch
  })
})

const getDirectionCount = (dir: string) => {
  return courses.value.filter(c => dir === '全部' || c.category === dir).length
}

const getDifficultyStyles = (diff: string) => {
  if (diff === '入门') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  if (diff === '进阶') return 'bg-amber-50 text-amber-600 border-amber-100'
  return 'bg-rose-50 text-rose-600 border-rose-100'
}

const getSyllabusForCourse = (courseId: string) => {
  if (courseId === 'prog-c' || courseId.includes('c-')) {
    return [
      {
        id: '01',
        title: '01 基础入门',
        meta: '5 节课 · 95分钟',
        lectures: [
          { id: '1.1', title: '1.1 C语言简介与开发环境搭建', type: '视频', duration: '15分钟', progress: 80, bilibili: { bvid: BILIBILI_BVID, part: 1 }, locked: false },
          { id: '1.2', title: '1.2 第一个C程序: Hello World', type: '视频', duration: '12分钟', progress: 100, bilibili: { bvid: BILIBILI_BVID, part: 6 }, locked: false },
          { id: '1.3', title: '1.3 变量与数据类型', type: '视频', duration: '18分钟', progress: 100, bilibili: { bvid: BILIBILI_BVID, part: 11 }, locked: false },
          { id: '1.4', title: '1.4 输入输出与格式化', type: '视频', duration: '20分钟', progress: 75, bilibili: { bvid: BILIBILI_BVID, part: 14 }, locked: false },
          { id: '1.5', title: '1.5 课后练习: 基础编程题', type: '练习', duration: '30分钟', progress: 0, locked: true },
        ]
      },
      {
        id: '02',
        title: '02 流程控制',
        meta: '4 节课 · 80分钟',
        lectures: [
          { id: '2.1', title: '2.1 if-else分支判定结构', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 24 }, locked: false },
          { id: '2.2', title: '2.2 switch-case多项选择机制', type: '视频', duration: '15分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 31 }, locked: false },
          { id: '2.3', title: '2.3 while与do-while循环结构', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 33 }, locked: false },
          { id: '2.4', title: '2.4 for循环高维嵌套及break控制', type: '视频', duration: '25分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 38 }, locked: false },
        ]
      },
      {
        id: '03',
        title: '03 数组与字符串',
        meta: '4 节课 · 75分钟',
        lectures: [
          { id: '3.1', title: '3.1 一维数组存储声明与指针偏置', type: '视频', duration: '15分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 73 }, locked: false },
          { id: '3.2', title: '3.2 二维数组网格数据映射机制', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 78 }, locked: false },
          { id: '3.3', title: '3.3 字符数组、字符串与标准库函数', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 86 }, locked: false },
          { id: '3.4', title: '3.4 数组冒泡与选择排序底层演习', type: '练习', duration: '20分钟', progress: 0, locked: false }
        ]
      },
      {
        id: '04',
        title: '04 函数',
        meta: '3 节课 · 60分钟',
        lectures: [
          { id: '4.1', title: '4.1 函数声明、形参实参与返回值', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 66 }, locked: false },
          { id: '4.2', title: '4.2 模块化封装：局部与全局变量作用域', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 71 }, locked: false },
          { id: '4.3', title: '4.3 递归函数原理与分支防爆规避', type: '练习', duration: '20分钟', progress: 0, locked: false }
        ]
      },
      {
        id: '05',
        title: '05 指针与内存',
        meta: '4 节课 · 90分钟',
        lectures: [
          { id: '5.1', title: '5.1 指针概念：地址、引用与间接寻址', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 80 }, locked: false },
          { id: '5.2', title: '5.2 指针与数组：地址计算与指针偏移', type: '视频', duration: '25分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 82 }, locked: false },
          { id: '5.3', title: '5.3 指针作为参数传递值与传递引用', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 81 }, locked: false },
          { id: '5.4', title: '5.4 动态内存分配 malloc/free 详解', type: '练习', duration: '25分钟', progress: 0, locked: false }
        ]
      }
    ]
  }

  return [
    {
      id: '01',
      title: '01 课程简介与基础起航',
      meta: '3 节课 · 45分钟',
      lectures: [
        { id: '1.1', title: '1.1 学前大纲串讲与核心概念先修', type: '视频', duration: '15分钟', progress: 100, bilibili: { bvid: BILIBILI_BVID, part: 1 }, locked: false },
        { id: '1.2', title: '1.2 上手第一个Demo流程演示', type: '视频', duration: '15分钟', progress: 50, bilibili: { bvid: BILIBILI_BVID, part: 6 }, locked: false },
        { id: '1.3', title: '1.3 本章节重点要领自主思考练习', type: '练习', duration: '15分钟', progress: 0, locked: false }
      ]
    },
    {
      id: '02',
      title: '02 原理剖析与深度开发',
      meta: '3 节课 · 60分钟',
      lectures: [
        { id: '2.1', title: '2.1 常见的算法结构或者是系统逻辑', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 73 }, locked: false },
        { id: '2.2', title: '2.2 核心应用场景与架构模型讲解', type: '视频', duration: '20分钟', progress: 0, bilibili: { bvid: BILIBILI_BVID, part: 66 }, locked: false },
        { id: '2.3', title: '2.3 课后作业与高频笔试题测试', type: '练习', duration: '20分钟', progress: 0, locked: true }
      ]
    }
  ]
}

const getLectureDetail = (lectureId: string, courseId: string) => {
  if (courseId === 'prog-c' || courseId.includes('c-') || courseId.includes('prog')) {
    switch (lectureId) {
      case '1.1':
        return {
          description: '了解C语言的历史、特点及应用场景，学习如何搭建本地 GCC / Clang 交叉编译环境，并运行第一个C程序。',
          goals: [
            '了解C语言的历史和广泛工业界的场景应用',
            '掌握交叉编译套件 gcc-c++ 的安装与变量配置',
            '顺利在终端中通过命令行编译并输出第一个主干代码'
          ],
          resources: [
            { name: 'C语言精简核心简介.pdf', type: 'pdf' },
            { name: 'hello_world示范代码.c', type: 'code' }
          ],
          code: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
          tags: ['C语言基础', '开发环境', '输入输出']
        }
      case '1.2':
        return {
          description: '深度剖析经典的 Hello World 工作入口，理解 main 函数入口契约、标准输入输出流 `stdio.h` 导入机制。',
          goals: [
            '理解 #include <stdio.h> 标准接口头文件',
            '理解 main 函数作为进程启动载体的规范',
            '掌握 printf 对格式控制字符 \\n 的输出溢出控制'
          ],
          resources: [
            { name: '班级专享课件：第一个C程序进修版.pdf', type: 'pdf' }
          ],
          code: `#include <stdio.h>\n\n/* 经典 main 主入口 */\nint main() {\n    printf("Hello, world! 本地编译通过。\\n");\n    return 0;\n}`,
          tags: ['程序入口', '格式字符']
        }
      case '1.3':
        return {
          description: '学习C语言最基本的数据类型与字符声明，包含整型、高精度浮点数和特殊变量作用域、生命周期。',
          goals: [
            '掌握 char, int, float, double 的字节大小与表达上限',
            '熟练了解修饰变量声明符 const / static 的作用',
            '学会打印不同数据类型的格式化占位字符 (%d, %.2f, %c)'
          ],
          resources: [
            { name: 'C语言常用变量定义与类型强制转化手册.pdf', type: 'pdf' }
          ],
          code: `#include <stdio.h>\n\nint main() {\n    int age = 18;\n    double score = 94.5;\n    char grade = 'A';\n    \n    printf("年龄: %d\\n", age);\n    printf("得分: %.1f, 级别: %c\\n", score, grade);\n    return 0;\n}`,
          tags: ['数据类型', '占位符']
        }
      case '1.4':
        return {
          description: '全方位掌握 printf 和 scanf 格式化输入输出。了解标准 I/O 缓冲区刷新机制与内存防脏读处理。',
          goals: [
            '熟练掌握 scanf 函数从键盘精确捕获用户行缓冲区输入',
            '掌握对多类型混杂输入的对齐定位方式',
            '通过 fflush() 解决读脏字符或空字符漏洞'
          ],
          resources: [
            { name: '讲义：格式化输入输出标准IO大坑.pdf', type: 'pdf' }
          ],
          code: `#include <stdio.h>\n\nint main() {\n    int choice;\n    printf("请输入你的专属选项 (1-5): ");\n    if (scanf("%d", &choice) == 1) {\n        printf("选中选项为: %d\\n", choice);\n    }\n    return 0;\n}`,
          tags: ['标准输入', '占500', 'IO缓冲区']
        }
      default:
        return {
          description: '掌握当前课程小节的核心内容原理，进行自主实操，编写并补充满足运行测试的代码。',
          goals: [
            '全面掌握当前大纲重点知识脉络',
            '调试运行配套示范源码通过标准编译器校验',
            '记录随堂笔记，并结合班级讨论解决编译异常'
          ],
          resources: [
            { name: '配套训练资料大包.zip', type: 'code' }
          ],
          code: `#include <stdio.h>\n\nint main() {\n    printf("当前课程代码正在加载中...\\n");\n    return 0;\n}`,
          tags: ['自主训练', '原理大纲']
        }
    }
  }

  return {
    description: `学习当前模块的经典内容，围绕其核心逻辑设计及应用场景，进行深度原理剖析。`,
    goals: [
      '理解该主题的基本定义与历史沿革',
      '在本地环境进行模块功能配置与运行',
      '通过配套代码加练对运行逻辑的认识'
    ],
    resources: [
      { name: '课后练习与讲课幻灯片.pdf', type: 'pdf' }
    ],
    code: `/* 示范样例 */\n#include <stdio.h>\nint main() {\n    printf("Hello World\\n");\n    return 0;\n}`,
    tags: ['开发先修', '随记']
  }
}

/**
 * Bilibili 视频嵌入相关
 */
const BILIBILI_BVID = 'BV13P4y117m4' // 翁恺 C语言程序设计

const getBilibiliEmbedUrl = (lect: any): string | undefined => {
  if (!lect.bilibili || !lect.bilibili.bvid) return undefined
  const { bvid, part } = lect.bilibili
  // 使用 Bilibili 官方推荐的 embed 格式，加 isOutside=true 适配外站嵌入
  return `https://player.bilibili.com/player.html?isOutside=true&bvid=${bvid}&p=${part}&high_quality=1&danmaku=0`
}

const hasBilibiliVideo = (lect: any): boolean => {
  return !!(lect.bilibili && lect.bilibili.bvid)
}

const getCategoryBadgeClass = (category: string) => {
  if (category.includes('编程')) return 'edu-course-card__badge--blue'
  if (category.includes('计算机')) return 'edu-course-card__badge--amber'
  if (category.includes('软件')) return 'edu-course-card__badge--green'
  if (category.includes('人工')) return 'edu-course-card__badge--purple'
  if (category.includes('前沿')) return 'edu-course-card__badge--cyan'
  return ''
}

const workspaceTabs = computed(() => [
  { id: '课程内容', label: '课程内容', badge: null as string | null },
])

const currentLectureDetail = computed(() => {
  if (!activeLectureId.value || !selectedCourse.value) return null
  return getLectureDetail(activeLectureId.value, selectedCourse.value.id)
})

const currentSyllabus = computed(() => {
  if (!selectedCourse.value) return []
  return getSyllabusForCourse(selectedCourse.value.id)
})

/** 当前选中的章节对象（包含 bilibili 视频信息） */
const currentLecture = computed<any>(() => {
  if (!activeLectureId.value || !currentSyllabus.value.length) return null
  return currentSyllabus.value.flatMap(ch => ch.lectures).find(l => l.id === activeLectureId.value) || null
})

const totalLectures = computed(() => {
  return currentSyllabus.value.reduce((acc, c) => acc + c.lectures.length, 0)
})

const completedLectures = computed(() => {
  return Math.ceil(((selectedCourse.value?.progress || 0) / 100) * totalLectures.value)
})

const allNotesFlat = computed(() => {
  return (Object.values(lectureNotes) as string[][]).flat().length
})

const handleLectureClick = (lect: any) => {
  if (lect.locked) {
    alert("本章随堂内容还未解锁，请先学完前面的前置基础内容！")
    return
  }
  activeLectureId.value = lect.id
}

const toggleChapter = (chapId: string) => {
  expandedChapters[chapId] = !expandedChapters[chapId]
}

const handleContinueStudy = () => {
  if (!selectedCourse.value) return
  const syllabusMap = getSyllabusForCourse(selectedCourse.value.id)
  let foundFirstIncomplete = '1.1'
  for (const ch of syllabusMap) {
    const incomplete = ch.lectures.find((l: any) => l.progress < 100)
    if (incomplete) {
      foundFirstIncomplete = incomplete.id
      break
    }
  }
  activeLectureId.value = foundFirstIncomplete
  courseWorkspaceTab.value = '课程内容'
}

const handleStudySettings = () => {
  const goalInput = prompt("请输入您这一周的打卡学习目标（单位：小时）：", "5")
  if (goalInput) {
    alert(`每周学习硬指标已更改为 ${goalInput} 小时！我们将督导您的打卡表现。`)
  }
}

const handlePrevLecture = () => {
  if (!selectedCourse.value) return
  const allLectures = getSyllabusForCourse(selectedCourse.value.id).flatMap(ch => ch.lectures)
  const idx = allLectures.findIndex((l: any) => l.id === activeLectureId.value)
  if (idx > 0) {
    activeLectureId.value = allLectures[idx - 1].id
  } else {
    alert("当前已经是本门课的第一节了！")
  }
}

const handleNextLecture = () => {
  if (!selectedCourse.value) return
  const allLectures = getSyllabusForCourse(selectedCourse.value.id).flatMap(ch => ch.lectures)
  const idx = allLectures.findIndex((l: any) => l.id === activeLectureId.value)

  const newProgress = Math.min(selectedCourse.value.progress + 6, 100)
  const updatedCourses = courses.value.map(c => {
    if (c.id === selectedCourse.value!.id) {
      return { ...c, progress: newProgress }
    }
    return c
  })
  courses.value = updatedCourses
  if (selectedCourse.value) {
    selectedCourse.value = { ...selectedCourse.value, progress: newProgress }
  }
  progressValue.value = newProgress

  if (idx < allLectures.length - 1) {
    activeLectureId.value = allLectures[idx + 1].id
    alert("恭喜您完成了这一节的学习！已为您自动同步学时，并顺畅推向下一小节知识体系。")
  } else {
    alert("完美！您已经阅览及学完本门主干课的最后一个小节！可以点击顶部前往打卡考学或者继续温习难点。")
  }
}

const handleDeleteNote = (lectId: string, nIdx: number) => {
  const originalNotes = lectureNotes[lectId] || []
  const updated = originalNotes.filter((_, i) => i !== nIdx)
  lectureNotes[lectId] = updated
}

const handleSaveNote = () => {
  if (!newLectureNote.value.trim() || !activeLectureId.value) return
  const list = lectureNotes[activeLectureId.value] || []
  lectureNotes[activeLectureId.value] = [...list, newLectureNote.value.trim()]
  newLectureNote.value = ''
  alert("随堂笔记保存成功！可在线持久化追踪。")
}

const handleRunLectureCode = () => {
  if (!currentLectureDetail.value?.code || isRunningCode.value) return
  isRunningCode.value = true
  terminalOutput.value = '⚡ compiler: allocating temporary virtual sandbox...\n⏰ gcc standard: code starting ...\n'
  setTimeout(() => {
    terminalOutput.value += '👉 command: gcc main.c -o a.out && ./a.out\n\n[stdout]:\n' + (
      activeLectureId.value === '1.1' ? 'Hello, World!' :
      activeLectureId.value === '1.2' ? 'Hello, world! 本地编译通过。' :
      activeLectureId.value === '1.3' ? '年龄: 18\n得分: 94.5, 级别: A' :
      activeLectureId.value === '1.4' ? '请输入选项: 3\n选中选项为: 3' : '当前课程代码正在加载中...'
    ) + '\n\n🎉 program finished with status 0'
    isRunningCode.value = false
  }, 800)
}

const handleNavigateToPractice = () => {
  if (!selectedCourse.value) return
  localStorage.setItem('edumind_current_course_id', selectedCourse.value.id)
  emit('navigateToTab', '练习中心')
}

const handleSelectCourse = (course: CourseItem) => {
  selectedCourse.value = course
  localStorage.setItem('edumind_current_course_id', course.id)
}

const handleStarCourse = () => {
  if (!selectedCourse.value) return
  const isCurrentlyStarred = !!starredCourses[selectedCourse.value.id]
  starredCourses[selectedCourse.value.id] = !isCurrentlyStarred
}

const handlePostForum = () => {
  if (!newForumInput.value.trim()) return
  forumPosts.value = [
    {
      id: Date.now(),
          author: '我（智学星枢）',
      avatar: '🦊',
      content: newForumInput.value.trim(),
      replies: 0,
      time: '刚刚'
    },
    ...forumPosts.value
  ]
  newForumInput.value = ''
  alert("学术问题帖子已成功发布到本班公开讨论板块！")
}

const handleReplyPost = () => {
  const reply = prompt("请输入您对此帖的互动回复：")
  if (reply) alert("回复发送成功！互动积点 +2。")
}

const handlePrivateMessage = () => {
  const msg = prompt("向张老师发送求助私信内容：")
  if (msg) alert(`私信已送达！张老师一般在课后答疑时间（19:00 - 21:00）集中回复您，请关注系统消息信箱。`)
}

const handleDownloadResource = (name: string) => {
  alert(`已触发下载附件《${name}》，供课下精读！`)
}

const handleDownloadLearningResource = (name: string) => {
  alert(`已触发下载打包文件《${name}》，请在本地查阅辅导文档！`)
}

const handleConsultAI = () => {
  alert("本小节的随堂提问已转发至右侧讨论论坛，或可在「智能AI导师」中随时对话获得秒级回应！")
}

const handleClearFilters = () => {
  searchQuery.value = ''
  activeDirection.value = '全部'
  difficultyFilter.value = '全部'
}

const calendarDays = [
  { day: 12, studied: false, current: false },
  { day: 13, studied: true, current: false },
  { day: 14, studied: false, current: false },
  { day: 15, studied: true, current: false },
  { day: 16, studied: false, current: true },
  { day: 17, studied: true, current: false },
  { day: 18, studied: false, current: false },
]

const leaderboardStudents = [
  { rank: 1, name: '程序狂小王', icon: '🥇', progress: '98%', status: '72小时' },
  { rank: 2, name: '代码小达人', icon: '🥈', progress: '95%', status: '68小时' },
  { rank: 3, name: '编程小白', icon: '🥉', progress: '92%', status: '52小时' },
  { rank: 4, name: '算法菜鸟', icon: '🍀', progress: '90%', status: '48小时' },
  { rank: 5, name: 'Debug大师', icon: '🔥', progress: '88%', status: '45小时' },
]

const learningResources = [
  { name: '课程核心讲义全套.pdf', desc: '期末考纲覆盖率100%，内含考研核心题型的汇总精讲。', format: 'PDF', size: '14.2 MB' },
  { name: '经典课堂大作业示例源码.zip', desc: '包含KMP、贪心背包等算法的高鲁棒性写法，可以直接加载测试。', format: 'ZIP', size: '2.5 MB' },
  { name: '推荐参考书目以及文献推荐.txt', desc: '包含业界领军学者编写的计算机逻辑丛书和学习路径网站汇总。', format: 'TXT', size: '15 KB' },
  { name: '线上直播答疑常见问题集Q&A.docx', desc: '汇集往届学长在开发环境、跨平台编译、模拟退火诊断中的20+大坑。', format: 'DOCX', size: '890 KB' }
]

const directions = ['全部', '编程与算法基础', '计算机系统', '软件工程', '人工智能方向', '前沿与应用']
</script>

<template>
  <div class="edu-courses flex-1 flex flex-col gap-6" id="courses-view-wrapper">
    <div v-if="selectedCourse" class="flex flex-col gap-5 animate-fade-in" id="course-workspace-pane">
      <div class="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700 pb-3">
        <button
          @click="selectedCourse = null"
          class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-accent text-[15px] font-medium transition-colors cursor-pointer border-none bg-transparent"
        >
          <ChevronLeft class="w-4 h-4" />
          <span>返回主课程目录列表</span>
        </button>
        <div class="flex items-center gap-2 text-[13.5px] text-slate-400 dark:text-slate-500">
          <span>应用层</span>
          <span>/</span>
          <span class="text-slate-600 dark:text-slate-300 font-semibold">{{ selectedCourse.category }}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs relative overflow-hidden">
        <div class="absolute top-0 right-0 w-32 h-32 bg-slate-50 dark:bg-slate-800 rounded-full blur-2xl opacity-70 -z-10" />

        <div class="lg:col-span-3 flex items-center justify-center">
          <div
            class="w-full h-36 rounded-xl flex flex-col justify-between p-4 text-white relative overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none group"
            :style="{
              background: `linear-gradient(135deg, ${selectedCourse.themeColor}, #0b153c)`
            }"
          >
            <div class="absolute -bottom-8 -left-4 text-[110px] font-black font-mono text-white/10 leading-none select-none pointer-events-none group-hover:scale-105 transition-transform duration-300">
              {{ selectedCourse.name.substring(0, 1) }}
            </div>

            <div class="flex justify-between items-start">
              <span class="text-[12px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider backdrop-blur-xs">
                {{ selectedCourse.difficulty }}
              </span>
              <BookOpen class="w-4 h-4 text-white/70" />
            </div>

            <div>
              <h4 class="text-[15px] font-bold tracking-tight mb-2 leading-tight">
                {{ selectedCourse.name }}
              </h4>
              <div class="flex items-center gap-1 text-[13px] font-semibold text-white/90">
                <span>开始学习</span>
                <ChevronRight class="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </div>

        <div class="lg:col-span-6 flex flex-col justify-center">
          <div class="flex items-center gap-2.5 mb-2">
            <h1 class="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              {{ selectedCourse.name }}
            </h1>

            <button
              @click="handleStarCourse"
              class="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 font-semibold text-[13px] border-none cursor-pointer transition-colors"
              :title="starredCourses[selectedCourse.id] ? '取消收藏' : '加入收藏'"
            >
              <Star class="w-3.5 h-3.5" :class="starredCourses[selectedCourse.id] ? 'text-amber-500 fill-amber-500' : 'text-slate-400'" />
              <span :class="starredCourses[selectedCourse.id] ? 'text-amber-700' : 'text-slate-600'">
                {{ starredCourses[selectedCourse.id] ? '已收藏' : '收藏' }}
              </span>
            </button>
          </div>

          <p class="text-[14px] text-slate-400 dark:text-slate-400 font-sans mb-4 max-w-xl leading-relaxed">
            {{ selectedCourse.description }}
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-150 dark:border-slate-700">
            <div class="flex items-center gap-2">
              <Award class="w-4 h-4 text-slate-400 shrink-0" />
              <div class="leading-none">
                <div class="text-[12px] text-slate-400 dark:text-slate-500">难度</div>
                <div class="text-[13.5px] font-bold text-slate-700 dark:text-slate-200 mt-0.5">{{ selectedCourse.difficulty }}</div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Clock class="w-4 h-4 text-slate-400 shrink-0" />
              <div class="leading-none">
                <div class="text-[12px] text-slate-400 dark:text-slate-500">学习时长</div>
                <div class="text-[13.5px] font-bold text-slate-700 dark:text-slate-200 mt-0.5">~{{ selectedCourse.studyHours }}小时</div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Layers class="w-4 h-4 text-slate-400 shrink-0" />
              <div class="leading-none">
                <div class="text-[12px] text-slate-400 dark:text-slate-500">知识内容</div>
                <div class="text-[13.5px] font-bold text-slate-700 dark:text-slate-200 mt-0.5">共 {{ selectedCourse.knowledgePoints.length }} 核心点</div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Users class="w-4 h-4 text-slate-400 shrink-0" />
              <div class="leading-none">
                <div class="text-[12px] text-slate-400 dark:text-slate-500">加入人数</div>
                <div class="text-[13.5px] font-bold text-slate-700 dark:text-slate-200 mt-0.5">14,352人</div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5 mt-3 select-none">
            <span
              v-for="(kp, kpIdx) in selectedCourse.knowledgePoints.slice(0, 5)"
              :key="kpIdx"
              class="text-[12px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200/75 dark:hover:bg-slate-600 rounded-md text-slate-500 dark:text-slate-400 font-semibold cursor-pointer border border-transparent transition-colors"
            >
              #{{ kp.concept }}
            </span>
          </div>
        </div>

        <div class="lg:col-span-3 bg-slate-50/50 dark:bg-slate-800 rounded-xl border border-slate-150/60 dark:border-slate-700 p-4 flex flex-col justify-between">
          <div class="flex items-center gap-3">
            <div class="relative w-12 h-12 flex items-center justify-center shrink-0">
              <svg class="w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="#e2e8f0" stroke-width="3" fill="transparent" />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  :stroke="selectedCourse.themeColor"
                  stroke-width="3.5"
                  fill="transparent"
                  :stroke-dasharray="126"
                  :stroke-dashoffset="126 - (126 * selectedCourse.progress) / 100"
                  stroke-linecap="round"
                  class="transition-all duration-300"
                />
              </svg>
              <span class="absolute text-[13px] font-mono font-bold text-slate-800 dark:text-white">{{ selectedCourse.progress }}%</span>
            </div>

            <div class="leading-tight">
              <h4 class="text-[14px] font-semibold text-slate-700 dark:text-slate-200">学习总进度</h4>
              <p class="text-[12px] text-slate-400 dark:text-slate-500">
                已完成 <span class="font-bold text-slate-600 dark:text-slate-300">{{ completedLectures }}</span> / {{ totalLectures }} 节课
              </p>
              <p class="text-[12.5px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                已学习：{{ (selectedCourse.progress * 0.15).toFixed(1) }} 小时
              </p>
            </div>
          </div>

          <div class="flex gap-2 mt-4">
            <button
              @click="handleContinueStudy"
              class="flex-1 py-1.5 rounded-lg bg-[#4a6cf7] hover:bg-[#3555db] text-white text-[13.5px] font-bold border-none cursor-pointer transition-colors flex items-center justify-center gap-1"
            >
              <Play class="w-3 h-3 fill-white" />
              <span>继续学习</span>
            </button>
            <button
              @click="handleStudySettings"
              class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-250 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-[13.5px] font-semibold cursor-pointer transition-colors"
            >
              学习设置
            </button>
          </div>
        </div>
      </div>

      <div class="flex border-b border-slate-200 dark:border-slate-700 select-none overflow-x-auto">
        <button
          v-for="tabDef in workspaceTabs"
          :key="tabDef.id"
          @click="courseWorkspaceTab = tabDef.id"
          :class="[
            'flex items-center gap-1.5 px-4.5 py-3 text-[14.5px] font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap bg-transparent',
            courseWorkspaceTab === tabDef.id
              ? 'border-[#4a6cf7] text-accent font-bold bg-[#fcfdff]/60 dark:bg-slate-800/60'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>{{ tabDef.label }}</span>
          <span v-if="tabDef.badge" class="text-[10.5px] px-1 bg-rose-500 text-white font-bold rounded-sm uppercase tracking-wider scale-95">
            {{ tabDef.badge }}
          </span>
        </button>
      </div>

      <div v-if="courseWorkspaceTab === '课程内容'" class="grid grid-cols-1 lg:grid-cols-12 gap-5" id="syllabus-learning-terminal">
        <div class="lg:col-span-3 flex flex-col gap-3.5 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs h-full max-h-[750px] overflow-y-auto">
          <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
            <h3 class="text-[15.5px] font-bold text-slate-800 dark:text-white flex items-center gap-1.5 select-none">
              <Layers class="w-4 h-4 text-indigo-500" />
              <span>课程教学大纲与章节</span>
            </h3>
            <span class="text-[12.5px] bg-[#f0f4ff] px-2 py-0.5 text-accent font-mono rounded-full">
              {{ currentSyllabus.length }} 单元
            </span>
          </div>

          <div class="flex flex-col gap-3">
            <div v-for="chap in currentSyllabus" :key="chap.id" class="border border-slate-150 dark:border-slate-700 rounded-xl overflow-hidden shadow-3xs">
              <div
                @click="toggleChapter(chap.id)"
                :class="[
                  'flex items-center justify-between p-3 cursor-pointer select-none transition-all',
                  expandedChapters[chap.id] ? 'bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-[#1e293b] hover:bg-slate-50/50 dark:hover:bg-slate-800'
                ]"
              >
                <div>
                  <h4 class="text-[14.5px] font-bold text-slate-700 dark:text-white leading-tight">
                    {{ chap.title }}
                  </h4>
                  <p class="text-[12px] text-slate-400 font-medium mt-0.5">
                    {{ chap.meta }}
                  </p>
                </div>
                <ChevronUp v-if="expandedChapters[chap.id]" class="w-4 h-4 text-slate-400" />
                <ChevronDown v-else class="w-4 h-4 text-slate-500" />
              </div>

              <div v-if="expandedChapters[chap.id]" class="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-[#1e293b] border-t border-slate-100 dark:border-slate-700">
                <div
                  v-for="lect in chap.lectures"
                  :key="lect.id"
                  @click="handleLectureClick(lect)"
                  :class="[
                    'flex items-start justify-between p-3.5 cursor-pointer transition-all',
                    activeLectureId === lect.id
                      ? 'bg-blue-50/90 dark:bg-blue-900/30 border-l-4 border-[#4a6cf7]'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800',
                    lect.locked ? 'opacity-60 cursor-not-allowed' : ''
                  ]"
                >
                  <div class="flex gap-2.5 max-w-[75%]">
                    <Lock v-if="lect.locked" class="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <Video v-else class="w-3.5 h-3.5 mt-0.5 shrink-0" :class="activeLectureId === lect.id ? 'text-accent' : 'text-slate-400'" />
                    <div class="leading-tight">
                      <span :class="['text-[14px] font-medium leading-relaxed block', activeLectureId === lect.id ? 'text-accent font-bold' : 'text-slate-600 dark:text-slate-300']">
                        {{ lect.title }}
                      </span>
                      <span class="text-[11.5px] text-slate-400 font-sans block mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {{ lect.type === '练习' ? '课后实操训练' : '在线微课' }} · {{ lect.duration }}
                        <span v-if="hasBilibiliVideo(lect)" class="inline-flex items-center gap-0.5 text-[10px] font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10 px-1.5 py-0.5 rounded-sm leading-none">
                          B站
                        </span>
                      </span>
                      <button
                        v-if="lect.type === '练习'"
                        @click.stop="handleNavigateToPractice"
                        class="mt-1.5 px-2.5 py-1 text-[12px] font-bold text-white bg-[#4a6cf7] hover:bg-[#3555db] rounded-md border-none cursor-pointer tracking-wider flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <Code class="w-2.5 h-2.5" />
                        <span>去练习中心</span>
                      </button>
                    </div>
                  </div>

                  <div class="w-20 shrink-0 text-right flex flex-col items-end justify-center h-8">
                    <div v-if="lect.progress === 100" class="flex items-center gap-1.5 text-emerald-600 text-[12px] font-bold">
                      <CheckCircle class="w-3.5 h-3.5" />
                      <span>已完成</span>
                    </div>
                    <div v-else-if="lect.progress > 0 && lect.progress < 100" class="w-full">
                      <div class="flex justify-between text-[10px] text-accent font-bold font-mono mb-0.5">
                        <span>学习中</span>
                        <span>{{ lect.progress }}%</span>
                      </div>
                      <div class="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600 rounded-full" :style="{ width: `${lect.progress}%` }" />
                      </div>
                    </div>
                    <span v-else-if="lect.locked" class="text-[11.5px] text-slate-400">未解锁</span>
                    <span v-else class="text-[12px] text-slate-400 bg-slate-100 dark:bg-slate-700 border border-slate-200/60 dark:border-slate-600 px-1.5 py-0.5 rounded">未开始</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="lg:col-span-6 flex flex-col gap-4">
          <template v-if="activeLectureId && currentLectureDetail">
            <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs h-full flex flex-col justify-between">
              <div>
                <div class="flex justify-between items-start border-b border-slate-100 dark:border-slate-700 pb-3 mb-3">
                  <div class="leading-tight pr-4">
                    <span class="text-[11px] font-mono font-bold bg-[#f0f4ff] dark:bg-slate-700 text-accent px-1.5 py-0.5 rounded">章节要义</span>
                    <h3 class="text-[15px] font-bold text-slate-800 dark:text-white tracking-tight mt-1 line-clamp-1">
                      {{ activeLectureId }} {{ currentLecture?.title?.split(' ')[1] || '当前专题' }}
                    </h3>
                  </div>
                  <button
                    @click="activeLectureId = ''"
                    class="text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer font-bold shrink-0 text-sm"
                    title="收起详情"
                  >
                    ✕
                  </button>
                </div>

                <div class="flex bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-lg p-0.5 mb-4 select-none">
                  <button
                    v-for="subTag in ['详情', '笔记', '问答']"
                    :key="subTag"
                    @click="lectureDetailTab = subTag as any"
                    :class="[
                      'flex-1 py-1 rounded text-[13px] font-semibold cursor-pointer border-none text-center transition-all',
                      lectureDetailTab === subTag
                        ? 'bg-white dark:bg-slate-700 text-accent shadow-3xs font-bold'
                        : 'text-slate-500 dark:text-slate-400 bg-transparent hover:text-slate-800 dark:hover:text-slate-200'
                    ]"
                  >
                    {{ subTag }}
                    <template v-if="subTag === '笔记'"> ({{ (lectureNotes[activeLectureId] || []).length }})</template>
                  </button>
                </div>

                <div v-if="lectureDetailTab === '详情'" class="flex flex-col gap-4 text-[14px] overflow-y-auto max-h-[520px]">
                  <!-- Bilibili 视频嵌入 + 跳转链接 -->
                  <div v-if="currentLecture && hasBilibiliVideo(currentLecture)" class="flex flex-col gap-2">
                    <div class="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
                      <div class="relative w-full aspect-video bg-black flex items-center justify-center">
                        <iframe
                          :src="getBilibiliEmbedUrl(currentLecture)"
                          scrolling="no"
                          frameborder="no"
                          class="absolute inset-0 w-full h-full"
                          style="border:none"
                          allow="autoplay; fullscreen"
                        />
                      </div>
                    </div>
                    <a
                      :href="`https://www.bilibili.com/video/${currentLecture.bilibili.bvid}?p=${currentLecture.bilibili.part}`"
                      target="_blank"
                      class="flex items-center justify-center gap-1.5 text-[12px] font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10 hover:bg-pink-100 dark:hover:bg-pink-500/20 rounded-lg py-2 transition-colors no-underline"
                    >
                      <span>📺</span>
                      <span>在 Bilibili 中打开观看第 {{ currentLecture.bilibili.part }} 集</span>
                      <ExternalLink class="w-3 h-3" />
                    </a>
                  </div>

                  <p class="text-slate-500 dark:text-slate-400 leading-relaxed font-sans bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                    {{ currentLectureDetail.description }}
                  </p>

                  <div>
                    <h5 class="font-bold text-slate-700 dark:text-white text-[13.5px] mb-2">🎯 专项学习目标</h5>
                    <div class="flex flex-col gap-2">
                      <div v-for="(goal, gIdx) in currentLectureDetail.goals" :key="gIdx" class="flex items-start gap-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/30">
                        <CheckCircle class="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span class="text-slate-600 dark:text-slate-300 leading-normal">{{ goal }}</span>
                      </div>
                    </div>
                  </div>

                  <div v-if="currentLectureDetail.resources && currentLectureDetail.resources.length > 0">
                    <h5 class="font-bold text-slate-700 dark:text-white text-[13.5px] mb-2">📎 配套讲义与示范代码</h5>
                    <div class="flex flex-col gap-1.5">
                      <div
                        v-for="(file, fIdx) in currentLectureDetail.resources"
                        :key="fIdx"
                        @click="handleDownloadResource(file.name)"
                        class="flex items-center justify-between p-2 rounded-lg border border-slate-200/70 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        <div class="flex items-center gap-2">
                          <FileText class="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span class="text-slate-600 dark:text-slate-300 font-semibold truncate max-w-xs">{{ file.name }}</span>
                        </div>
                        <span class="text-[12px] text-blue-600 font-medium flex items-center gap-0.5">
                          <span>下载</span>
                          <Download class="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 class="font-bold text-slate-700 dark:text-white text-[13.5px] mb-1.5 flex items-center gap-1">
                      <Code class="w-3.5 h-3.5 text-slate-400" />
                      <span>本微课核心编译程序</span>
                    </h5>

                    <div class="bg-slate-950 font-mono text-[13px] rounded-lg border border-slate-950 overflow-hidden shadow-md flex flex-col">
                      <div class="flex justify-between items-center bg-slate-900 border-b border-slate-800 px-3 py-2 shrink-0">
                        <span class="text-slate-400 text-[12px] ml-1">sandbox: main.c</span>
                        <button
                          @click="handleRunLectureCode"
                          :disabled="isRunningCode || !currentLectureDetail.code"
                          class="text-[11.5px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-2 py-0.5 rounded cursor-pointer border-none flex items-center gap-1 shrink-0"
                        >
                          {{ isRunningCode ? '编译中...' : '编译且运行' }}
                        </button>
                      </div>
                      <div class="p-3 bg-slate-950 text-slate-200 text-xs whitespace-pre select-text leading-relaxed max-h-48 overflow-y-auto">
                        {{ currentLectureDetail.code || '/* No sample program code available */' }}
                      </div>
                      <div v-if="terminalOutput" class="p-2 border-t border-slate-800 bg-slate-950 text-emerald-400 text-[12px] whitespace-pre-line leading-relaxed scroll-smooth max-h-32 overflow-y-auto border-t-2">
                        {{ terminalOutput }}
                      </div>
                    </div>
                  </div>

                  <div v-if="currentLectureDetail.tags && currentLectureDetail.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                    <span v-for="(tag, tIdx) in currentLectureDetail.tags" :key="tIdx" class="text-[11.5px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 font-medium">
                      {{ tag }}
                    </span>
                  </div>
                </div>

                <div v-if="lectureDetailTab === '笔记'" class="flex flex-col gap-3 text-[14px]">
                  <div class="flex flex-col gap-2 overflow-y-auto max-h-[350px] pr-1">
                    <div v-for="(note, nIdx) in (lectureNotes[activeLectureId] || [])" :key="nIdx" class="bg-[#fbfcff] dark:bg-slate-800 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700 leading-relaxed font-sans relative">
                      <p class="text-slate-600 dark:text-slate-300">{{ note }}</p>
                      <div class="flex justify-between items-center mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-400">
                        <span>小节：{{ activeLectureId }}</span>
                        <button
                          @click="handleDeleteNote(activeLectureId, nIdx)"
                          class="text-rose-500 hover:text-rose-600 cursor-pointer border-none bg-transparent"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div v-if="(lectureNotes[activeLectureId] || []).length === 0" class="p-8 text-center text-slate-400 font-sans border border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
                      <FileText class="w-8 h-8 mx-auto text-slate-300 mb-1" />
                      <span>暂无本小节专属笔记，立即在下方记录大纲要点吧！</span>
                    </div>
                  </div>

                  <div class="border-t border-slate-100 dark:border-slate-700 pt-3">
                    <textarea
                      v-model="newLectureNote"
                      placeholder="输入您对本节微课的随堂难点或核心代码笔记..."
                      class="w-full h-20 p-2 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 outline-none text-[13.5px] font-sans resize-none"
                    />
                    <button
                      @click="handleSaveNote"
                      class="mt-2 w-full py-1.5 rounded-lg bg-[#4a6cf7] hover:bg-[#3555db] text-white font-bold text-[13.5px] border-none cursor-pointer transition-colors"
                    >
                      保存随堂笔记
                    </button>
                  </div>
                </div>

                <div v-if="lectureDetailTab === '问答'" class="flex flex-col gap-3 text-[14px]">
                  <div class="flex flex-col gap-3 overflow-y-auto max-h-[350px] pr-1">
                    <div class="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700 font-sans">
                      <div class="font-bold text-slate-700 dark:text-white flex items-center gap-1.5">
                        <span>❓ 小白学习者：</span>
                        <span class="text-[12px] text-slate-400 font-normal">本章主打的 stdio.h 涵盖了哪些常见的 I/O 缓冲区控制？</span>
                      </div>
                      <p class="text-slate-500 dark:text-slate-400 mt-1 lines-normal">
                        它涵盖了 printf(), scanf(), getchar(), putchar(), standard outputs buffering. 如果想立刻清空可以用 fflush(stdout) 强制卸载堆栈积攒的字节流。
                      </p>
                    </div>
                    <div class="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 font-sans">
                      <div class="font-bold text-amber-800 flex items-center gap-1.5">
                        <Sparkles class="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                        <span>💡 智能AI导师解答指导：</span>
                      </div>
                      <p class="text-amber-700 mt-1 comments-normal">
                        如果 gcc 环境未搭建成功导致调试报错，可在左侧侧栏「智能AI导师」模块选用【环境搭建故障诊疗】快速修补系统环境变量。
                      </p>
                    </div>
                  </div>

                  <div class="border-t border-slate-100 dark:border-slate-700 pt-3">
                    <button
                      @click="handleConsultAI"
                      class="w-full py-1.5 rounded-lg border border-slate-250 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[13.5px] cursor-pointer transition-colors"
                    >
                      随时咨询 AI 专属老师
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2.5 border-t border-slate-100 dark:border-slate-700 pt-3 shrink-0">
                <button
                  @click="handlePrevLecture"
                  class="flex-1 py-1.5 rounded-lg border border-slate-250 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[13px] cursor-pointer transition-colors"
                >
                  ← 上一节
                </button>

                <button
                  @click="handleNextLecture"
                  class="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13.5px] border-none cursor-pointer transition-colors"
                >
                  学完切换下一节 →
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-8 shadow-2xs h-full text-center flex flex-col justify-center select-none">
              <Video class="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <h4 class="text-[15.5px] font-bold text-slate-700 dark:text-white">请选择单元微课展开详情</h4>
              <p class="text-[13.5px] text-slate-400 mt-1 max-w-xs mx-auto leading-normal">
                点击左侧大纲中的具体学习章节，即可在此处同步开启高亮课前指南、代码测试、配套下载及专项重点精讲问诊！
              </p>
            </div>
          </template>
        </div>

        <div class="lg:col-span-3 flex flex-col gap-4">
          <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs">
            <h4 class="text-[14px] font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">
              课程讲师
            </h4>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-indigo-100 text-accent flex items-center justify-center font-bold text-[15px] border border-indigo-200 shrink-0 select-none">
                👨‍🏫
              </div>
              <div class="leading-tight shrink-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-slate-800 dark:text-white text-[14px]">张老师</span>
                  <span class="text-[11px] bg-orange-100 text-orange-600 font-bold px-1 py-0.5 rounded">资深讲师</span>
                </div>
                <p class="text-[12px] text-slate-400 mt-0.5 font-sans whitespace-nowrap overflow-hidden text-ellipsis">
                  计算机专业 · 8年一线高校教学经验
                </p>
              </div>
            </div>
            <button
              @click="handlePrivateMessage"
              class="w-full mt-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[13px] cursor-pointer transition-colors"
            >
              私信咨询老师
            </button>
          </div>

          <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs">
            <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2 mb-3 select-none">
              <h4 class="text-[14px] font-bold text-slate-800 dark:text-white">课程班级公告</h4>
              <span class="text-[12px] text-blue-500 hover:text-blue-600 cursor-pointer font-medium">查看全部</span>
            </div>
            <div class="flex flex-col gap-3">
              <div class="text-[13.5px] leading-tight font-sans border-l-2 border-indigo-500 pl-2">
                <div class="flex justify-between text-[12px] text-slate-400 font-medium select-none">
                  <span>第 3 章作业已正式发布</span>
                  <span>2天前</span>
                </div>
                <p class="text-slate-500 dark:text-slate-400 text-[13px] mt-1 leading-normal">
                  数组与字符章节随堂实践作业已在平台上线，推荐本周日 23:59 前提交。
                </p>
              </div>

              <div class="text-[13.5px] leading-tight font-sans border-l-2 border-slate-300 dark:border-slate-600 pl-2">
                <div class="flex justify-between text-[12px] text-slate-400 font-medium select-none">
                  <span>本周答疑直播活动安排</span>
                  <span>5天前</span>
                </div>
                <p class="text-slate-500 dark:text-slate-400 text-[13px] mt-1 leading-normal">
                  周五晚上 19:30 - 20:30，助教将在直播间统一辅导实验代码故障。
                </p>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs select-none">
            <h4 class="text-[14px] font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">
              学习记录日历
            </h4>
            <div class="grid grid-cols-7 gap-1 text-center mb-1">
              <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w" class="text-[11.5px] text-slate-400 font-bold">{{ w }}</span>
            </div>
            <div class="grid grid-cols-7 gap-1.5 text-center text-[12.5px]">
              <div
                v-for="(item, idx) in calendarDays"
                :key="idx"
                :class="[
                  'py-1.5 font-mono font-bold rounded-lg flex flex-col items-center justify-center relative',
                  item.studied
                    ? 'bg-[#f0f4ff] text-accent border border-[#e2ebff]'
                    : item.current
                      ? 'bg-[#4a6cf7] text-white font-black scale-105 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                ]"
                :title="item.studied ? '今日已打卡学满学成小时指标' : '今日尚未开启学习'"
              >
                <span>{{ item.day }}</span>
                <span v-if="item.studied" class="absolute bottom-0.5 w-1 h-1 bg-[#4a6cf7] rounded-full" />
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs">
            <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2 mb-3 select-none">
              <h4 class="text-[14px] font-bold text-slate-800 dark:text-white">班级学习排行榜</h4>
              <span class="text-[12px] text-blue-500 cursor-pointer font-medium">查看全部</span>
            </div>
            <div class="flex flex-col gap-2.5">
              <div v-for="student in leaderboardStudents" :key="student.rank" class="flex items-center justify-between text-[13.5px] font-sans">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] shrink-0 font-bold text-slate-400 select-none w-4">{{ student.rank }}</span>
                  <span class="select-none text-xs shrink-0">{{ student.icon }}</span>
                  <span class="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[85px]">{{ student.name }}</span>
                </div>
                <div class="text-right leading-none shrink-0 font-mono">
                  <span class="text-accent font-bold text-[13.5px]">{{ student.progress }}</span>
                  <span class="block text-[10px] text-slate-400 font-medium mt-0.5">{{ student.status }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="courseWorkspaceTab === '课程介绍'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-2xs antialiased text-[15px] leading-relaxed select-text font-sans">
        <h3 class="font-bold text-slate-800 dark:text-white text-[16px] border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">
          📖 课程深度核心背景介绍
        </h3>
        <p class="text-slate-500 dark:text-slate-300 mb-4 font-sans leading-relaxed">
          本课程以高水准教学体系为标准，由计算机工程学院教授团队、高频实机研讨导师、资深代码架构总监精心拼装研发。
          覆盖从底层计算原理、到应用层复杂算法封装的多维跨度，全面打通系统瓶颈。
        </p>

        <h4 class="font-bold text-slate-700 dark:text-white text-[14.5px] mb-2">📌 先修推荐要领</h4>
        <p class="text-slate-400 dark:text-slate-500 font-sans mb-4">
          建议先行掌握：<span class="bg-[#f0f4ff] font-bold text-accent px-2 py-0.5 rounded text-[13px] font-mono">{{ selectedCourse.preRequisite }}</span>，以便更好地理解本门课所阐述的高密度内存调度指针模型或深部特征拓扑网络。
        </p>

        <h4 class="font-bold text-slate-700 dark:text-white text-[14.5px] mb-2">💡 重点核心收获知识树</h4>
        <ul class="list-disc pl-5 text-slate-500 dark:text-slate-400 flex flex-col gap-1.5 font-sans">
          <li v-for="(kp, kpIdx) in selectedCourse.knowledgePoints" :key="kpIdx">
            <strong class="text-slate-700 dark:text-slate-200 font-bold">【{{ kp.concept }}】</strong> - {{ kp.description }}
          </li>
        </ul>
      </div>

      <div v-if="courseWorkspaceTab === '学习资源'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="learning-resources-deck">
        <div
          v-for="(res, rIdx) in learningResources"
          :key="rIdx"
          @click="handleDownloadLearningResource(res.name)"
          class="bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-3xs hover:border-[#4a6cf7]/30 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div class="flex justify-between items-start mb-2 select-none">
              <span class="text-[11px] bg-[#f0f4ff] text-accent font-bold px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                {{ res.format }}
              </span>
              <Download class="w-4 h-4 text-slate-400 hover:text-accent" />
            </div>
            <h4 class="text-[14.5px] font-bold text-slate-800 dark:text-white leading-snug truncate">
              {{ res.name }}
            </h4>
            <p class="text-[13px] text-slate-400 mt-1 font-sans leading-normal">
              {{ res.desc }}
            </p>
          </div>
          <div class="text-[12px] text-slate-400 border-t border-slate-50 pt-2 flex justify-between items-center mt-3 font-semibold">
            <span>文档大小: {{ res.size }}</span>
            <span class="text-accent font-bold">获取该资源</span>
          </div>
        </div>
      </div>

      <div v-if="courseWorkspaceTab === '笔记'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e8e8e8] dark:border-slate-700 p-5 shadow-2xs text-[14px] font-sans">
        <h3 class="font-bold text-slate-800 dark:text-white text-[16px] border-b border-slate-100 dark:border-slate-700 pb-2 mb-4">
          📝 我的随堂笔记库
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <template v-for="(notes, lectId) in lectureNotes" :key="lectId">
            <div v-for="(note, nIdx) in notes" :key="`${lectId}-${nIdx}`" class="bg-slate-50/70 dark:bg-slate-800 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700 flex flex-col justify-between">
              <p class="text-slate-600 dark:text-slate-300 leading-relaxed font-sans">{{ note }}</p>
              <div class="flex justify-between items-center mt-4 border-t border-slate-100/80 dark:border-slate-700 pt-2 text-[12px] text-slate-400 select-none">
                <span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">小节: {{ lectId }}</span>
                <button
                  @click="handleDeleteNote(lectId as string, nIdx)"
                  class="text-rose-500 hover:text-rose-600 cursor-pointer bg-transparent border-none"
                >
                  删除笔记
                </button>
              </div>
            </div>
          </template>
          <div v-if="allNotesFlat === 0" class="col-span-full border border-dashed border-slate-200 dark:border-slate-600 py-12 text-center text-slate-400 rounded-xl">
            <FileText class="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p>目前还没有写下任何笔记。学习左侧课程大纲时，可以点击随堂模块快速记录！</p>
          </div>
        </div>
      </div>

      <div v-if="courseWorkspaceTab === '讨论区'" class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div class="lg:col-span-2 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs flex flex-col gap-4">
          <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2.5">
            <h3 class="text-[15px] font-bold text-slate-800 dark:text-white flex items-center gap-1.5 select-none">
              <MessageSquare class="w-4 h-4 text-emerald-500" />
              <span>学术互动发帖交流楼</span>
            </h3>
            <span class="text-[12.5px] text-slate-400">共 {{ forumPosts.length }} 帖</span>
          </div>

          <div class="flex flex-col gap-3.5 overflow-y-auto max-h-[420px] pr-1">
            <div v-for="post in forumPosts" :key="post.id" class="bg-slate-50/50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700 flex gap-3 flex-col sm:flex-row justify-between">
              <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-emerald-100 text-[16px] flex items-center justify-center border border-emerald-200 shrink-0 select-none">
                  {{ post.avatar }}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-700 dark:text-white text-[14px]">{{ post.author }}</span>
                    <span class="text-[11.5px] text-slate-400 font-medium">{{ post.time }}</span>
                  </div>
                  <p class="text-slate-600 dark:text-slate-300 text-[14px] leading-relaxed font-sans mt-1.5">
                    {{ post.content }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 sm:flex-col justify-end shrink-0 select-none text-right">
                <span class="text-[13px] text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full inline-block font-medium">
                  💬 {{ post.replies }} 楼追问回复
                </span>
                <button
                  @click="handleReplyPost"
                  class="text-[12.5px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer border-none bg-transparent mt-1"
                >
                  回帖
                </button>
              </div>
            </div>
          </div>

          <div class="border-t border-slate-100 dark:border-slate-700 pt-3">
            <div class="flex gap-2">
              <input
                type="text"
                v-model="newForumInput"
                placeholder="对本门课存在学术疑惑？敲入大意在这里发布给全班解答..."
                class="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1 text-[13.5px] text-slate-700 dark:text-slate-200 outline-none w-full font-sans"
              />
              <button
                @click="handlePostForum"
                class="px-4 py-1.5 bg-[#4a6cf7] hover:bg-[#3555db] text-white font-bold text-[13.5px] rounded-lg cursor-pointer border-none transition-colors"
              >
                公开发帖
              </button>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-2xs">
          <h4 class="text-[14px] font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">
            班级讨论指南规范
          </h4>
          <ul class="list-disc pl-4 text-[12.5px] text-slate-400 flex flex-col gap-2 font-sans">
            <li>提问前推荐先使用右侧「核心程序代码」进行实机代码语法排查。</li>
            <li>发帖时可贴出简洁语法堆栈细节，严禁恶意灌水，促进班级学术进步！</li>
            <li>张老师或负责助教会每周在线筛选出3篇「黄金精华贴」给予考评分奖励！</li>
          </ul>
        </div>
      </div>

      <div v-if="courseWorkspaceTab === '学习记录'" class="bg-white dark:bg-[#1e293b] rounded-2xl border border-[#e8e8e8] dark:border-slate-700 p-5 shadow-2xs font-sans text-[14px]">
        <h3 class="font-bold text-slate-800 dark:text-white text-[16px] border-b border-slate-100 dark:border-slate-700 pb-2 mb-4">
          📊 我的高光课程学习履历统计
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5 select-none">
          <div class="bg-slate-50 dark:bg-slate-800 p-4 border border-slate-150 dark:border-slate-700 rounded-xl leading-snug">
            <span class="text-[12px] text-slate-400 dark:text-slate-500">总打卡次数</span>
            <div class="text-[18px] font-black text-slate-800 dark:text-white mt-1 font-mono">14 次</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800 p-4 border border-slate-150 dark:border-slate-700 rounded-xl leading-snug">
            <span class="text-[12px] text-slate-400 dark:text-slate-500">累计专注小时</span>
            <div class="text-[18px] font-black text-slate-800 dark:text-white mt-1 font-mono">11.2 小时</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800 p-4 border border-slate-150 dark:border-slate-700 rounded-xl leading-snug">
            <span class="text-[12px] text-slate-400 dark:text-slate-500">随堂代码运行</span>
            <div class="text-[18px] font-black text-slate-800 dark:text-white mt-1 font-mono">42 回</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800 p-4 border border-slate-150 dark:border-slate-700 rounded-xl leading-snug">
            <span class="text-[12px] text-slate-400 dark:text-slate-500">同伴班级平均超越</span>
            <div class="text-[18px] font-black text-emerald-600 mt-1 font-mono">Top 85%</div>
          </div>
        </div>

        <div class="bg-slate-50/50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 max-w-lg">
          <h4 class="font-bold text-slate-700 dark:text-white text-[13.5px] mb-2">学力达成综合雷达提示</h4>
          <p class="text-slate-550 dark:text-slate-400 leading-relaxed font-sans">
            已深入攻克第 1 单元入门开发准备，学期总规划耗时 18 小时，预计还将持续需要 6.8 个高净值打卡学时，即可安全通过微章考试并获得专业评估证书！加油！
          </p>
        </div>
      </div>
    </div>

    <template v-else>
      <div class="flex flex-col gap-4">
        <div class="edu-course-tabs flex flex-wrap items-center gap-2 p-2 rounded-xl" id="course-directions-tab">
          <button
            v-for="(dir, idx) in directions"
            :key="idx"
            @click="activeDirection = dir"
            :class="[
              'edu-course-tabs__button flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[14px] cursor-pointer transition-all duration-200',
              activeDirection === dir
                ? 'is-active text-white font-semibold'
                : 'text-[#a3abdd] hover:text-white'
            ]"
          >
            <span>{{ dir }}</span>
            <span :class="[
              'text-[12px] px-1.5 py-0.5 rounded-full font-mono transition-colors',
              activeDirection === dir
                ? 'bg-white/15 text-white font-medium'
                : 'bg-white/5 text-[#9ba4d8]'
            ]">
              {{ getDirectionCount(dir) }}
            </span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" id="courses-grid-list">
        <div
          v-for="course in filteredCourses"
          :key="course.id"
          @click="handleSelectCourse(course)"
          :class="[
            'edu-course-card group',
            course.progress > 0 ? 'is-started' : ''
          ]"
        >
          <div class="edu-course-card__header">
            <div class="flex items-center gap-2">
              <span :class="['edu-course-card__badge', getCategoryBadgeClass(course.category)]">
                {{ course.category }}
              </span>
              <span class="edu-course-card__dot">·</span>
              <span class="edu-course-card__meta">{{ course.difficulty }}</span>
            </div>
            <span class="edu-course-card__hours">{{ course.studyHours }}h</span>
          </div>

          <h4 class="edu-course-card__title" :title="course.name">
            {{ course.name }}
          </h4>
          <p class="edu-course-card__desc" :title="course.description">
            {{ course.description }}
          </p>

          <div class="edu-course-card__footer">
            <div class="edu-course-card__progress-wrap">
              <div class="edu-course-card__progress-bar">
                <div
                  class="edu-course-card__progress-fill"
                  :style="{ width: `${course.progress}%` }"
                />
              </div>
              <span class="edu-course-card__progress-text">{{ course.progress }}%</span>
            </div>
            <button class="edu-course-card__cta">
              {{ course.progress === 100 ? '复习' : '学习' }}
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div v-if="filteredCourses.length === 0" class="col-span-full rounded-2xl p-16 text-center border border-white/6 w-full max-w-lg mx-auto my-8 animate-fade-in" style="background: rgba(255,255,255,0.02); backdrop-filter: blur(20px);">
          <AlertCircle class="w-10 h-10 text-white/20 mx-auto mb-4" />
          <h4 class="text-[16px] font-semibold text-white/70 mb-2">未找到相关课程</h4>
          <p class="text-[13px] text-white/30 max-w-xs mx-auto mb-5 leading-relaxed">
            没有符合当前筛选条件的课程，试试调整搜索关键字或清除过滤器。
          </p>
          <button
            @click="handleClearFilters"
            class="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all"
            style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6);"
          >
            清除筛选条件
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.edu-courses {
  color: #e0e7ff;
}

/* ── 筛选标签栏 ── */
.edu-course-tabs {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
}

.edu-course-tabs__button {
  min-height: 36px;
  border: 1px solid transparent;
}

.edu-course-tabs__button.is-active {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* ── 卡片：苹果简约玻璃风 ── */
.edu-course-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(40px) saturate(1.2);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  overflow: hidden;
}

.edu-course-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  pointer-events: none;
}

.edu-course-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.edu-course-card.is-started {
  border-color: rgba(59, 130, 246, 0.15);
}

/* ── 卡片头部 ── */
.edu-course-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.edu-course-card__badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  letter-spacing: 0.02em;
}

.edu-course-card__dot {
  color: rgba(255, 255, 255, 0.2);
  font-size: 12px;
}

.edu-course-card__meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.edu-course-card__hours {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  letter-spacing: 0.03em;
}

/* ── 卡片内容 ── */
.edu-course-card__title {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.35;
  margin: 0;
  letter-spacing: -0.01em;
}

.edu-course-card__desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

/* ── 卡片底部 ── */
.edu-course-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.edu-course-card__progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.edu-course-card__progress-bar {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.edu-course-card__progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  transition: width 0.6s ease;
}

.edu-course-card__progress-text {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  min-width: 32px;
  text-align: right;
}

.edu-course-card__cta {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.edu-course-card__cta:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.35);
}

/* ── 分类标签颜色 ── */
.edu-course-card__badge[class*="编程"] {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}

.edu-course-card__badge[class*="计算机"] {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}

.edu-course-card__badge[class*="软件"] {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}

.edu-course-card__badge[class*="人工"] {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
}

.edu-course-card__badge[class*="前沿"] {
  background: rgba(6, 182, 212, 0.12);
  color: #22d3ee;
}

/* ── 默认标签样式 ── */
.edu-course-card__badge {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
}

/* ── 分类标签颜色变体 ── */
.edu-course-card__badge--blue {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}

.edu-course-card__badge--amber {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}

.edu-course-card__badge--green {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}

.edu-course-card__badge--purple {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
}

.edu-course-card__badge--cyan {
  background: rgba(6, 182, 212, 0.12);
  color: #22d3ee;
}
</style>
