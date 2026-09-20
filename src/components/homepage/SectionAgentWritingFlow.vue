<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  FileSearch,
  GitBranch,
  PenLine,
  ShieldCheck,
} from 'lucide-vue-next'

type AgentState = 'idle' | 'running' | 'done'
type AgentTone = 'cyan' | 'purple' | 'green' | 'blue' | 'pink' | 'amber'

interface WritingAgent {
  id: string
  name: string
  label: string
  duty: string
  output: string
  tone: AgentTone
  state: AgentState
}

const baseAgents: WritingAgent[] = [
  {
    id: 'profile',
    name: '画像分析 Agent',
    label: 'PROFILE',
    duty: '读取学习画像与薄弱项',
    output: '定位 3 个关键薄弱维度',
    tone: 'purple',
    state: 'idle',
  },
  {
    id: 'outline',
    name: '大纲规划 Agent',
    label: 'OUTLINE',
    duty: '拆解目标并组织章节',
    output: '生成 5 段式学习方案',
    tone: 'cyan',
    state: 'idle',
  },
  {
    id: 'resource',
    name: '素材检索 Agent',
    label: 'SOURCE',
    duty: '匹配课程、习题与案例',
    output: '召回 8 个可信资源',
    tone: 'green',
    state: 'idle',
  },
  {
    id: 'writer',
    name: '内容生成 Agent',
    label: 'WRITER',
    duty: '生成讲解、任务与提示词',
    output: '写入分层辅导脚本',
    tone: 'blue',
    state: 'idle',
  },
  {
    id: 'review',
    name: '评估校验 Agent',
    label: 'REVIEW',
    duty: '检查掌握度与任务难度',
    output: '校准知识掌握度 68%',
    tone: 'pink',
    state: 'idle',
  },
  {
    id: 'evidence',
    name: '证据归档 Agent',
    label: 'TRACE',
    duty: '沉淀证据链与版本记录',
    output: '写入 68 条学习证据',
    tone: 'amber',
    state: 'idle',
  },
]

const draftLines = [
  '学习目标：围绕指针与图结构建立可追踪补弱闭环。',
  '路径安排：先图解核心概念，再进入专项练习和错题复盘。',
  '资源建议：优先使用可视化卡片、BFS 队列动画和 5 题微训练。',
  '评估反馈：每次练习后回写掌握度，触发下一轮资源推荐。',
  '证据链路：保留提问、测评、资源使用与路径调整记录。',
]

const agents = ref<WritingAgent[]>(baseAgents.map(agent => ({ ...agent })))
const activeIndex = ref(0)
const typedLineCount = ref(1)
const stream = ref([
  '画像分析 Agent 正在读取学习状态',
  '大纲规划 Agent 已创建学习方案骨架',
  '素材检索 Agent 正在匹配补救资源',
])

let timer: ReturnType<typeof setInterval> | null = null

const activeAgent = computed(() => agents.value[activeIndex.value])

function advance() {
  agents.value = agents.value.map((agent, index) => ({
    ...agent,
    state: index < activeIndex.value ? 'done' : index === activeIndex.value ? 'running' : 'idle',
  }))

  const current = agents.value[activeIndex.value]
  stream.value = [
    `${current.name}：${current.output}`,
    ...stream.value,
  ].slice(0, 5)

  typedLineCount.value = Math.min(draftLines.length, typedLineCount.value + 1)
  activeIndex.value = (activeIndex.value + 1) % agents.value.length

  if (activeIndex.value === 0) {
    typedLineCount.value = 1
    agents.value = agents.value.map(agent => ({ ...agent, state: 'idle' }))
  }
}

onMounted(() => {
  timer = setInterval(advance, 1800)
  advance()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="agent-writing-section">
    <div class="writing-bg-grid" aria-hidden="true" />
    <div class="writing-inner">
      <div class="writing-header">
        <div>
          <div class="writing-eyebrow">
            <span />
            MULTI-AGENT COLLABORATION · 动态协作
          </div>
          <h2>多智能体不是摆设，而是在共同生成学习闭环</h2>
          <p>
            画像、规划、检索、生成、校验与归档持续接力，把一次学习请求写成可解释、可追踪、可优化的辅导方案。
          </p>
        </div>
        <div class="writing-status">
          <strong>{{ activeAgent.name }}</strong>
          <span>{{ activeAgent.duty }}</span>
        </div>
      </div>

      <div class="writing-stage">
        <div class="agent-column">
          <article
            v-for="(agent, index) in agents"
            :key="agent.id"
            class="agent-card"
            :class="[`tone-${agent.tone}`, `state-${agent.state}`]"
            :style="{ '--delay': `${index * 0.08}s` }"
          >
            <div class="agent-icon">
              <BrainCircuit v-if="agent.id === 'profile'" :size="18" />
              <GitBranch v-else-if="agent.id === 'outline'" :size="18" />
              <FileSearch v-else-if="agent.id === 'resource'" :size="18" />
              <PenLine v-else-if="agent.id === 'writer'" :size="18" />
              <ClipboardCheck v-else-if="agent.id === 'review'" :size="18" />
              <ShieldCheck v-else :size="18" />
            </div>
            <div>
              <div class="agent-label">{{ agent.label }}</div>
              <h3>{{ agent.name }}</h3>
              <p>{{ agent.duty }}</p>
            </div>
            <span class="agent-state">{{ agent.state }}</span>
          </article>
        </div>

        <div class="writing-canvas">
          <div class="canvas-orbit orbit-one" aria-hidden="true" />
          <div class="canvas-orbit orbit-two" aria-hidden="true" />
          <div class="canvas-core">
            <BookOpenCheck :size="30" />
            <span>Learning Plan</span>
            <strong>协同生成中</strong>
          </div>
          <div class="draft-panel">
            <div class="draft-toolbar">
              <span class="toolbar-dot" />
              <span>ZHIXUE_XINGSHU_LOOP_DRAFT.md</span>
              <span class="draft-live">LIVE</span>
            </div>
            <div class="draft-body">
              <p
                v-for="(line, index) in draftLines.slice(0, typedLineCount)"
                :key="line"
                :class="{ typing: index === typedLineCount - 1 }"
              >
                {{ line }}
              </p>
            </div>
          </div>
        </div>

        <aside class="stream-panel">
          <div class="stream-title">
            <span />
            AGENT STREAM
          </div>
          <div class="stream-list">
            <div v-for="item in stream" :key="item" class="stream-item">
              <time>{{ new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</time>
              <span>{{ item }}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-writing-section {
  position: relative;
  padding: 86px 56px 64px;
  overflow: hidden;
}

.writing-bg-grid {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(0, 212, 255, 0.08), transparent 58%),
    linear-gradient(rgba(0, 212, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 212, 255, 0.04) 1px, transparent 1px);
  background-size: auto, 52px 52px, 52px 52px;
  mask-image: radial-gradient(ellipse at center, black 20%, transparent 82%);
  pointer-events: none;
}

.writing-inner {
  position: relative;
  z-index: 1;
  max-width: 1760px;
  margin: 0 auto;
}

.writing-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  margin-bottom: 32px;
}

.writing-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #00d4ff;
  font: 700 10px/1 'JetBrains Mono', monospace;
  letter-spacing: 0.22em;
}

.writing-eyebrow span,
.stream-title span,
.toolbar-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #00d4ff;
  box-shadow: 0 0 12px #00d4ff;
}

.writing-header h2 {
  margin: 0;
  max-width: 760px;
  color: #e8edf5;
  font-family: 'Instrument Serif', serif;
  font-size: clamp(32px, 4vw, 52px);
  font-weight: 500;
  line-height: 1.08;
  letter-spacing: 0;
}

.writing-header p {
  max-width: 690px;
  margin: 14px 0 0;
  color: #8892b0;
  line-height: 1.8;
  font-size: 14px;
}

.writing-status {
  min-width: 280px;
  padding: 16px 18px;
  border: 1px solid rgba(0, 212, 255, 0.18);
  border-radius: 12px;
  background: rgba(10, 14, 32, 0.68);
  backdrop-filter: blur(14px);
}

.writing-status strong,
.writing-status span {
  display: block;
}

.writing-status strong {
  color: #e8edf5;
  margin-bottom: 6px;
}

.writing-status span {
  color: #00d4ff;
  font-size: 12px;
}

.writing-stage {
  display: grid;
  grid-template-columns: 330px minmax(420px, 1fr) 360px;
  gap: 22px;
  align-items: stretch;
}

.agent-column,
.stream-panel,
.draft-panel {
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(10, 14, 32, 0.68);
  backdrop-filter: blur(16px);
  border-radius: 14px;
}

.agent-column {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.agent-card {
  --agent-color: #00d4ff;
  display: grid;
  grid-template-columns: 42px 1fr auto;
  gap: 10px;
  align-items: center;
  min-height: 82px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  opacity: 0.72;
  animation: card-in 0.45s ease both;
  animation-delay: var(--delay);
  transition: border-color 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
}

.tone-cyan { --agent-color: #00d4ff; }
.tone-purple { --agent-color: #7c3aed; }
.tone-green { --agent-color: #06d6a0; }
.tone-blue { --agent-color: #3b82f6; }
.tone-pink { --agent-color: #f43f5e; }
.tone-amber { --agent-color: #f59e0b; }

.agent-card.state-running {
  opacity: 1;
  transform: translateX(5px);
  border-color: color-mix(in srgb, var(--agent-color) 62%, transparent);
  box-shadow: 0 0 28px color-mix(in srgb, var(--agent-color) 18%, transparent);
}

.agent-card.state-done {
  opacity: 0.94;
  border-color: rgba(6, 214, 160, 0.22);
}

.agent-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  color: var(--agent-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--agent-color) 14%, transparent);
}

.state-running .agent-icon {
  animation: breathe 1.1s ease-in-out infinite;
}

.agent-label,
.agent-state {
  color: var(--agent-color);
  font: 700 10px/1 'JetBrains Mono', monospace;
  letter-spacing: 0.16em;
}

.agent-card h3 {
  margin: 5px 0 4px;
  color: #e8edf5;
  font-size: 15px;
}

.agent-card p {
  margin: 0;
  color: #8892b0;
  font-size: 12px;
}

.agent-state {
  writing-mode: vertical-rl;
  opacity: 0.65;
}

.writing-canvas {
  position: relative;
  min-height: 540px;
  border-radius: 16px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 50%, rgba(0, 212, 255, 0.12), transparent 34%),
    radial-gradient(circle at 72% 22%, rgba(124, 58, 237, 0.13), transparent 30%),
    rgba(4, 8, 20, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.canvas-orbit {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  border: 1px dashed rgba(0, 212, 255, 0.22);
  transform: translate(-50%, -50%);
}

.orbit-one {
  width: 72%;
  height: 44%;
  animation: spin 42s linear infinite;
}

.orbit-two {
  width: 50%;
  height: 68%;
  border-color: rgba(124, 58, 237, 0.22);
  animation: spin-reverse 58s linear infinite;
}

.canvas-core {
  position: absolute;
  left: 50%;
  top: 45%;
  width: 180px;
  height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  color: #e8edf5;
  text-align: center;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.28), transparent 24%),
    radial-gradient(circle, rgba(0, 212, 255, 0.38), rgba(8, 12, 30, 0.96) 70%);
  border: 1px solid rgba(0, 212, 255, 0.38);
  box-shadow: 0 0 64px rgba(0, 212, 255, 0.26);
}

.canvas-core svg {
  color: #00d4ff;
}

.canvas-core span {
  color: #8892b0;
  font: 700 10px/1 'JetBrains Mono', monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.canvas-core strong {
  font-size: 20px;
}

.draft-panel {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 32px;
  overflow: hidden;
}

.draft-toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  color: #8892b0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  font: 700 10px/1 'JetBrains Mono', monospace;
  letter-spacing: 0.12em;
}

.draft-live {
  margin-left: auto;
  color: #06d6a0;
}

.draft-body {
  min-height: 132px;
  padding: 16px 18px 18px;
}

.draft-body p {
  margin: 0 0 9px;
  color: #dcecff;
  font-size: 13px;
  line-height: 1.5;
}

.draft-body p::before {
  content: ">";
  margin-right: 8px;
  color: #00d4ff;
}

.typing::after {
  content: "";
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 4px;
  vertical-align: -2px;
  background: #00d4ff;
  animation: cursor 0.8s steps(1) infinite;
}

.stream-panel {
  padding: 18px;
}

.stream-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
  color: #00d4ff;
  font: 700 10px/1 'JetBrains Mono', monospace;
  letter-spacing: 0.18em;
}

.stream-list {
  display: grid;
  gap: 10px;
}

.stream-item {
  display: grid;
  gap: 5px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.055);
  animation: stream-in 0.35s ease both;
}

.stream-item time {
  color: #4a5568;
  font: 700 10px/1 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.stream-item span {
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.5;
}

@keyframes card-in {
  from { opacity: 0; transform: translateX(-10px); }
}

@keyframes stream-in {
  from { opacity: 0; transform: translateY(8px); }
}

@keyframes breathe {
  0%, 100% { box-shadow: 0 0 4px color-mix(in srgb, var(--agent-color) 12%, transparent); }
  50% { box-shadow: 0 0 10px color-mix(in srgb, var(--agent-color) 22%, transparent); }
}

@keyframes spin {
  to { rotate: 360deg; }
}

@keyframes spin-reverse {
  to { rotate: -360deg; }
}

@keyframes cursor {
  50% { opacity: 0; }
}

@media (max-width: 1180px) {
  .writing-stage {
    grid-template-columns: 1fr;
  }

  .writing-header {
    align-items: start;
    flex-direction: column;
  }

  .writing-status {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 900px) {
  .agent-writing-section {
    padding: 60px 24px 44px;
  }

  .writing-canvas {
    min-height: 500px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-card,
  .state-running .agent-icon,
  .canvas-orbit,
  .stream-item,
  .typing::after {
    animation: none !important;
  }
}
</style>
