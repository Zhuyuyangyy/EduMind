<script setup lang="ts">
import { ref, computed } from 'vue'

interface TickerItem {
  agent: string
  text: string
}

interface AgentInfo {
  id: string
  color: string
  name: string
}

const agents: AgentInfo[] = [
  { id: 'profile-capture', color: '#7c3aed', name: '画像采集' },
  { id: 'profile-diagnosis', color: '#a78bfa', name: '薄弱诊断' },
  { id: 'path-plan', color: '#00d4ff', name: '路径规划' },
  { id: 'path-replan', color: '#14b8a6', name: '动态重规划' },
  { id: 'resource-search', color: '#06d6a0', name: '资源检索' },
  { id: 'resource-generate', color: '#84cc16', name: '资源生成' },
  { id: 'tutor-explain', color: '#f59e0b', name: '讲解辅导' },
  { id: 'tutor-dialogue', color: '#fb923c', name: '互动答疑' },
  { id: 'eval-quiz', color: '#f43f5e', name: '评估出题' },
  { id: 'eval-cause', color: '#ec4899', name: '错因分析' },
  { id: 'feedback-write', color: '#3b82f6', name: '反馈回写' },
  { id: 'reflection', color: '#6366f1', name: '成长复盘' },
]

const initialItems: TickerItem[] = [
  { agent: 'profile-capture', text: '采集答题、停留和偏好信号，更新六维核心学习画像' },
  { agent: 'profile-diagnosis', text: '识别到「指针与内存」掌握度仅 42%，标记为薄弱知识域' },
  { agent: 'path-plan', text: '在课后巩固阶段插入「二级指针专项训练」学习节点' },
  { agent: 'path-replan', text: '根据最新测评结果重排明日学习顺序，前置 2 个基础节点' },
  { agent: 'resource-search', text: '从本地知识索引检索候选材料，并记录来源与匹配分数' },
  { agent: 'resource-generate', text: '为薄弱点生成适配当前画像的学习资源与专项练习' },
  { agent: 'tutor-explain', text: '准备好提供辅导，支持概念讲解、代码辅导、错题诊断等模式' },
  { agent: 'tutor-dialogue', text: '根据学生回答生成下一轮追问，帮助确认是否真正理解' },
  { agent: 'eval-quiz', text: '完成阶段性测评，发现 4 个知识盲点需要进一步巩固' },
  { agent: 'eval-cause', text: '将错题拆成概念、步骤和迁移三类原因，生成错因标签' },
  { agent: 'feedback-write', text: '已更新学习画像，指针类知识点优先级提升' },
  { agent: 'reflection', text: '生成今日复盘摘要，沉淀成就、风险和明日行动建议' },
]

const items = ref<TickerItem[]>([...initialItems])

const displayedItems = computed<TickerItem[]>(() => [...items.value, ...items.value])

function getAgent(id: string) {
  return agents.find(a => a.id === id)
}
</script>

<template>
  <div class="collaboration-log">
    <div class="log-header">
      <h3 class="log-title">多智能体协作</h3>
      <span class="log-desc">7 个核心智能体在 6 个模块内协同工作，并记录每次决策证据</span>
    </div>
    
    <div class="log-container">
      <div class="log-track">
        <div
          v-for="(item, i) in displayedItems"
          :key="`${item.agent}-${i}`"
          class="log-entry"
        >
          <div class="log-agent" :style="`color: ${getAgent(item.agent)?.color}`">
            {{ getAgent(item.agent)?.name }}
          </div>
          <div class="log-content">{{ item.text }}</div>
        </div>
      </div>
      <div class="log-fade log-fade-top" aria-hidden="true" />
      <div class="log-fade log-fade-bottom" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.collaboration-log {
  box-sizing: border-box;
  max-width: 1760px;
  margin: 0 auto 0;
  padding: 0 36px;
  position: relative;
  z-index: 3;
  transform: translateY(-26px);
}

.log-header {
  text-align: center;
  margin-bottom: 14px;
}

.log-title {
  margin: 0;
  font-family: 'Instrument Serif', 'Georgia', serif;
  font-size: 30px;
  font-weight: 400;
  color: #e8edf5;
  letter-spacing: -0.01em;
  line-height: 1.08;
}

.log-desc {
  display: block;
  margin: 6px 0 0 0;
  font-size: 14px;
  color: #8892b0;
  font-family: 'Outfit', 'Segoe UI', sans-serif;
  line-height: 1.45;
}

.log-container {
  background:
    radial-gradient(ellipse at 52% 0%, rgba(0, 212, 255, 0.08), transparent 62%),
    rgba(18, 22, 48, 0.66);
  border: 1px solid rgba(0, 212, 255, 0.18);
  border-radius: 16px;
  padding: 0 28px;
  position: relative;
  overflow: hidden;
  height: 192px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 0 rgba(0, 212, 255, 0);
  animation: log-border-breathe 4.8s ease-in-out infinite;
}

.log-track {
  display: flex;
  flex-direction: column;
  animation: scroll-ticker 24s linear infinite;
}

.log-container:hover .log-track {
  animation-play-state: paused;
}

@keyframes scroll-ticker {
  0% {
    transform: translateY(0);
  }

  100% {
    transform: translateY(-768px);
  }
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  opacity: 0.75;
  transition: opacity 0.3s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  box-sizing: border-box;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-entry:hover {
  opacity: 1;
}

.log-agent {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 12px;
  font-weight: 600;
  min-width: 90px;
  letter-spacing: 0.02em;
}

.log-content {
  flex: 1;
  font-family: 'Outfit', 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #e8edf5;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-fade {
  position: absolute;
  left: 0;
  right: 0;
  height: 48px;
  pointer-events: none;
}

.log-fade-top {
  top: 0;
  background: linear-gradient(180deg, rgba(18, 22, 48, 0.95), transparent);
}

.log-fade-bottom {
  bottom: 0;
  background: linear-gradient(0deg, rgba(18, 22, 48, 0.95), transparent);
}

@keyframes log-border-breathe {
  0%,
  100% {
    border-color: rgba(0, 212, 255, 0.16);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 0 0 rgba(0, 212, 255, 0);
  }

  50% {
    border-color: rgba(0, 212, 255, 0.26);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 0 8px rgba(0, 212, 255, 0.07);
  }
}

@media (max-width: 900px) {
  .collaboration-log {
    padding: 0 16px;
    margin-top: 0;
    transform: translateY(-12px);
  }
  
  .log-title {
    font-size: 24px;
  }
  
  .log-container {
    padding: 20px;
  }
  
  .log-entry {
    flex-direction: column;
    gap: 4px;
  }
  
  .log-agent {
    min-width: auto;
  }
}
</style>
