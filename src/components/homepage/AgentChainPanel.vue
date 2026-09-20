<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Sparkles, ArrowRight, CheckCircle2, AlertTriangle, Clock, Activity } from 'lucide-vue-next'
import { fetchAgentWorkflow } from '@/lib/api'
import type { AgentTrace, LearningWorkflowResponse } from '@/types/api'

const T = {
  cyan: '#00d4ff', purple: '#7c3aed', emerald: '#06d6a0',
  amber: '#f59e0b', rose: '#f43f5e', blue: '#3b82f6',
  text: '#e8edf5', textSub: '#8892b0', textTri: '#4a5568',
  serif: "'Instrument Serif', 'Noto Serif SC', serif",
  sans: "'Outfit', 'PingFang SC', sans-serif",
  mono: "'JetBrains Mono', monospace",
}

interface AgentCard {
  agentId: string
  agentName: string
  role: string
  input: string
  process: string
  output: string
  confidence: number
  evidenceTags: string[]
  status: 'running' | 'completed' | 'pending' | 'error'
  color: string
}

const fallbackAgents: AgentCard[] = [
  {
    agentId: 'profile', agentName: 'ProfileAgent', role: '画像分析',
    input: '学生答题记录 + 历史画像', process: '分析六维核心画像',
    output: '识别指针与图结构薄弱', confidence: 0.92,
    evidenceTags: ['画像分析', '薄弱识别'], status: 'completed', color: T.purple,
  },
  {
    agentId: 'resource', agentName: 'ResourceAgent', role: '资源推荐',
    input: '薄弱知识点 + 偏好', process: '匹配资源库 + LLM 生成',
    output: '5 个个性化资源', confidence: 0.87,
    evidenceTags: ['资源匹配', 'LLM生成'], status: 'completed', color: T.emerald,
  },
  {
    agentId: 'path', agentName: 'PathAgent', role: '路径规划',
    input: '画像 + 评估反馈', process: '路径规划 + 节点插入',
    output: '插入 2 个补弱节点', confidence: 0.85,
    evidenceTags: ['路径重排', '补弱插入'], status: 'completed', color: T.cyan,
  },
  {
    agentId: 'tutor', agentName: 'TutorAgent', role: '智能辅导',
    input: '学生提问 + 上下文', process: '多模式辅导生成',
    output: '概念讲解 + 代码示例', confidence: 0.90,
    evidenceTags: ['辅导生成', '多模式'], status: 'running', color: T.amber,
  },
  {
    agentId: 'eval', agentName: 'EvaluationAgent', role: '效果评估',
    input: '练习结果 + 资源完成度', process: '多维评估 + 错因分析',
    output: '4 个盲点 + 错因归类', confidence: 0.88,
    evidenceTags: ['效果评估', '错因分析'], status: 'pending', color: T.rose,
  },
  {
    agentId: 'reflection', agentName: 'ReflectionAgent', role: '反向传播',
    input: '评估结果 + 画像变化', process: '反向传播 + 路径修正',
    output: '画像更新 + 路径触发', confidence: 0.83,
    evidenceTags: ['反向传播', '路径触发'], status: 'pending', color: T.blue,
  },
]

const agents = ref<AgentCard[]>([...fallbackAgents])
const loading = ref(true)
const usingFallback = ref(false)

function mapTraceToCard(trace: AgentTrace): AgentCard {
  const colorMap: Record<string, string> = {
    profile: T.purple, resource: T.emerald, path: T.cyan,
    tutor: T.amber, eval: T.rose, reflection: T.blue,
  }
  return {
    agentId: trace.agentId,
    agentName: trace.agentName,
    role: trace.role,
    input: trace.input,
    process: trace.process,
    output: trace.output,
    confidence: trace.confidence,
    evidenceTags: trace.evidenceTags,
    status: trace.status,
    color: colorMap[trace.agentId] ?? T.cyan,
  }
}

onMounted(async () => {
  try {
    const data: LearningWorkflowResponse = await fetchAgentWorkflow()
    if (data.agents && data.agents.length > 0) {
      agents.value = data.agents.map(mapTraceToCard)
    } else {
      usingFallback.value = true
    }
  } catch {
    usingFallback.value = true
  } finally {
    loading.value = false
  }
})

function statusIcon(status: AgentCard['status']) {
  switch (status) {
    case 'running': return Activity
    case 'completed': return CheckCircle2
    case 'error': return AlertTriangle
    default: return Clock
  }
}

function statusLabel(status: AgentCard['status']) {
  switch (status) {
    case 'running': return '执行中'
    case 'completed': return '已完成'
    case 'error': return '异常'
    default: return '待执行'
  }
}
</script>

<template>
  <section class="section-agent-chain">
    <div class="chain-inner">
      <div class="chain-header">
        <div>
          <div class="chain-eyebrow" :style="`color: ${T.purple}`">
            <span class="eyebrow-dot" :style="`background: ${T.purple}`" />
            AGENT CHAIN · 多智能体协同
          </div>
          <h2 class="chain-title">
            多智能体<span :style="`color: ${T.purple}`">协同执行链</span>
          </h2>
          <p class="chain-desc">
            6 个智能体按序协作 — 从画像分析到反向传播，每一步都有据可查、有迹可循。
            <span v-if="usingFallback" :style="`color: ${T.amber}`">（演示数据）</span>
          </p>
        </div>
        <div class="chain-meta">
          <div class="chain-meta-item">
            <Sparkles :size="14" :style="`color: ${T.purple}`" />
            <span class="chain-meta-label">智能体</span>
            <span class="chain-meta-val" :style="`color: ${T.purple}`">{{ agents.length }}</span>
          </div>
          <div class="chain-meta-item">
            <Activity :size="14" :style="`color: ${T.emerald}`" />
            <span class="chain-meta-label">运行中</span>
            <span class="chain-meta-val" :style="`color: ${T.emerald}`">{{ agents.filter((a: AgentCard) => a.status === 'running').length }}</span>
          </div>
          <div class="chain-meta-item">
            <CheckCircle2 :size="14" :style="`color: ${T.cyan}`" />
            <span class="chain-meta-label">已完成</span>
            <span class="chain-meta-val" :style="`color: ${T.cyan}`">{{ agents.filter((a: AgentCard) => a.status === 'completed').length }}</span>
          </div>
        </div>
      </div>

      <div class="chain-flow">
        <template v-for="(agent, i) in agents" :key="agent.agentId">
          <div class="agent-card" :class="`agent-${agent.status}`"
            :style="`--agent-color: ${agent.color}`">
            <div class="agent-card-header">
              <div class="agent-name-row">
                <span class="agent-name">{{ agent.agentName }}</span>
                <span class="agent-role-tag"
                  :style="`color: ${agent.color}; background: ${agent.color}15; border-color: ${agent.color}33`">
                  {{ agent.role }}
                </span>
              </div>
              <div class="agent-status" :class="`status-${agent.status}`">
                <component :is="statusIcon(agent.status)" :size="12" />
                <span>{{ statusLabel(agent.status) }}</span>
              </div>
            </div>

            <div class="agent-fields">
              <div class="agent-field">
                <span class="agent-field-label">输入</span>
                <span class="agent-field-value">{{ agent.input }}</span>
              </div>
              <div class="agent-field">
                <span class="agent-field-label">处理</span>
                <span class="agent-field-value">{{ agent.process }}</span>
              </div>
              <div class="agent-field">
                <span class="agent-field-label">输出</span>
                <span class="agent-field-value" :style="`color: ${agent.color}`">{{ agent.output }}</span>
              </div>
            </div>

            <div class="agent-confidence">
              <div class="confidence-bar-bg">
                <div class="confidence-bar-fill"
                  :style="`width: ${agent.confidence * 100}%; background: ${agent.color}`" />
              </div>
              <span class="confidence-val" :style="`color: ${agent.color}`">
                {{ Math.round(agent.confidence * 100) }}%
              </span>
            </div>

            <div class="agent-tags">
              <span v-for="tag in agent.evidenceTags" :key="tag" class="agent-tag"
                :style="`color: ${agent.color}; background: ${agent.color}12; border-color: ${agent.color}28`">
                {{ tag }}
              </span>
            </div>

            <div v-if="agent.status === 'running'" class="agent-running-indicator"
              :style="`border-color: ${agent.color}40`">
              <span class="running-dot" :style="`background: ${agent.color}; box-shadow: 0 0 8px ${agent.color}`" />
            </div>
          </div>

          <div v-if="Number(i) < agents.length - 1" class="chain-arrow">
            <ArrowRight :size="18" :style="`color: ${agent.color}88`" />
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-agent-chain {
  padding: 90px 56px 60px;
  position: relative;
}

.chain-inner {
  max-width: 1760px;
  margin: 0 auto;
}

.chain-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 40px;
  gap: 24px;
  flex-wrap: wrap;
}

.chain-eyebrow {
  font-size: 10px;
  letter-spacing: 0.24em;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.eyebrow-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulse-soft 1.5s ease-in-out infinite;
}

.chain-title {
  margin: 0;
  font-family: 'Instrument Serif', serif;
  font-size: 40px;
  font-weight: 500;
  color: #e8edf5;
  letter-spacing: -0.02em;
  line-height: 1.1;
  text-wrap: balance;
}

.chain-desc {
  margin: 10px 0 0;
  font-size: 13.5px;
  color: #8892b0;
  max-width: 620px;
}

.chain-meta {
  display: flex;
  gap: 16px;
  background: rgba(10, 12, 28, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 22px;
  backdrop-filter: blur(12px);
}

.chain-meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 70px;
}

.chain-meta-label {
  font-size: 9px;
  color: #8892b0;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.12em;
}

.chain-meta-val {
  font-family: 'Instrument Serif', serif;
  font-size: 22px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.chain-flow {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 8px;
}

.agent-card {
  flex: 1;
  min-width: 220px;
  background: rgba(10, 14, 32, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 20px;
  backdrop-filter: blur(14px);
  position: relative;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.agent-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.agent-running {
  border-color: rgba(245, 158, 11, 0.25);
}

.agent-error {
  border-color: rgba(244, 63, 94, 0.25);
}

.agent-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
  gap: 8px;
}

.agent-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #e8edf5;
  letter-spacing: 0.02em;
}

.agent-role-tag {
  font-size: 9.5px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border-radius: 100px;
  border: 1px solid;
  font-weight: 500;
  white-space: nowrap;
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.08em;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-running {
  color: #f59e0b;
}

.status-completed {
  color: #06d6a0;
}

.status-pending {
  color: #4a5568;
}

.status-error {
  color: #f43f5e;
}

.agent-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.agent-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-field-label {
  font-size: 9px;
  color: #4a5568;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.agent-field-value {
  font-size: 12px;
  color: #8892b0;
  line-height: 1.45;
}

.agent-confidence {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.confidence-bar-bg {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.confidence-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease;
}

.confidence-val {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}

.agent-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.agent-tag {
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.08em;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid;
  font-weight: 500;
}

.agent-running-indicator {
  position: absolute;
  top: -1px;
  left: 16px;
  right: 16px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  overflow: hidden;
}

.running-dot {
  display: block;
  width: 24px;
  height: 100%;
  border-radius: 2px;
  animation: running-slide 1.8s ease-in-out infinite;
}

@keyframes running-slide {
  0% { transform: translateX(-24px); }
  100% { transform: translateX(calc(100% + 24px)); }
}

.chain-arrow {
  display: flex;
  align-items: center;
  padding: 0 4px;
  flex-shrink: 0;
  align-self: center;
}

@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .eyebrow-dot, .running-dot {
    animation: none !important;
  }
}

@media (max-width: 1100px) {
  .chain-flow {
    gap: 0;
  }
  .agent-card {
    min-width: 200px;
  }
}

@media (max-width: 900px) {
  .section-agent-chain {
    padding: 60px 24px 40px;
  }
  .chain-title {
    font-size: 28px;
  }
  .chain-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .agent-card {
    min-width: 180px;
    padding: 16px;
  }
}
</style>
