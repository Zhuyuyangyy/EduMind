<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  Code,
  Copy,
  FileText,
  Layers,
  Lightbulb,
  Map,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Target,
  ThumbsDown,
  ThumbsUp,
  User,
  Wand2,
  Zap,
  X,
} from 'lucide-vue-next'
import { sendChatMessage, fetchChatHistory, createChatIdempotencyKey } from '@/lib/api'
import type { ChatReply, ChatResource, MultimodalContent, ChatHistoryItem } from '@/types/api'

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
  resources?: ChatResource[]
  suggestions?: string[]
  multimodalContents?: MultimodalContent[]
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingImages = ref<Array<{ id: string; dataUrl: string; type: string }>>([])

interface AgentNode {
  name: string
  icon: unknown
  status: 'idle' | 'active' | 'done'
  color: string
  desc: string
}

const router = useRouter()

const messages = ref<Message[]>([
  {
    id: 1,
    role: 'assistant',
    content: '晚上好，Alice\n\n我可以帮助你学习任何内容，选择下方功能或直接输入你的问题',
    time: '09:30',
    suggestions: ['帮我制定 Python 学习计划', '解释机器学习概念', '生成练习题', '去智能辅导提问'],
  },
])

const inputText = ref('')
// P4-2B-3b：失败待重试的幂等键（与内容绑定，内容变化即作废）
const pendingChatKey = ref<string | null>(null)
const pendingChatText = ref('')
const isStreaming = ref(false)
const isSending = ref(false)
const streamContent = ref('')
const chatEndRef = ref<HTMLElement | null>(null)
const showAgentPanel = ref(false)
const selectedPreset = ref('')

const agents = ref<AgentNode[]>([
  { name: '画像分析', icon: User, status: 'idle', color: '#00d4ff', desc: '分析学习特征与能力水平' },
  { name: '资源生成', icon: BookOpen, status: 'idle', color: '#7c3aed', desc: '生成定制学习材料' },
  { name: '路径规划', icon: Map, status: 'idle', color: '#06d6a0', desc: '规划最优学习路径' },
  { name: '质量评估', icon: BarChart3, status: 'idle', color: '#f59e0b', desc: '评估学习效果与反馈' },
])

const historySessions = ref<Array<{ id: number; title: string; time: string; category: string }>>([])

async function loadChatHistory() {
  try {
    const items = await fetchChatHistory()
    historySessions.value = items
      .filter((item: ChatHistoryItem) => item.role === 'user' && item.content.trim())
      .map((item: ChatHistoryItem, index: number) => ({
        id: item.id || index + 1,
        title: item.content.slice(0, 30) + (item.content.length > 30 ? '...' : ''),
        time: item.time,
        category: '对话',
      }))
  } catch {
    historySessions.value = [
      { id: 1, title: 'Python 机器学习入门', time: '10分钟前', category: 'ML' },
      { id: 2, title: '微积分复习 — 泰勒展开', time: '2小时前', category: '数学' },
      { id: 3, title: '数据结构与算法练习', time: '昨天', category: '算法' },
    ]
  }
}

const resourceIcons: Record<ChatResource['type'], unknown> = {
  doc: FileText,
  mindmap: Map,
  exercise: Target,
  video: Play,
  code: Code,
}

const presets = [
  { icon: Wand2, label: '制定学习计划', desc: '根据你的目标定制个性化学习路径', color: '#8b5cf6' },
  { icon: Target, label: '生成练习题', desc: '生成适合当前水平的练习题和测试', color: '#06b6d4' },
  { icon: BookOpen, label: '知识点讲解', desc: '深入理解概念，结合例子与可视化讲解', color: '#10b981' },
  { icon: BarChart3, label: '学习诊断', desc: '分析学习情况，找到薄弱环节并给出建议', color: '#f59e0b' },
  { icon: Zap, label: '智能辅导', desc: '实时解答疑问，提供提示和引导', color: '#ec4899' },
]

const quickQuestions = [
  { text: '帮我制定 Python 学习计划', action: 'send' },
  { text: '解释机器学习中的过拟合', action: 'send' },
  { text: '生成 10 道二元函数求导题', action: 'send' },
  { text: '推荐数据结构学习路径', action: 'send' },
  { text: '如何理解梯度下降算法', action: 'send' },
]

const canSend = computed(() => Boolean(inputText.value.trim()) && !isSending.value && !isStreaming.value)

function scrollToBottom() {
  nextTick(() => {
    chatEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function resetAgents() {
  agents.value.forEach(agent => {
    agent.status = 'idle'
  })
}

function fallbackChatReply(message: string): ChatReply {
  const topic = message.trim() || '当前学习问题'
  return {
    content:
      `好的，我已经分析了你的需求：${topic}\n\n` +
      '**关键要点：**\n\n' +
      '1. **理解核心原理** — 先掌握基本概念和理论基础\n' +
      '2. **动手实践** — 通过实际项目巩固所学知识\n' +
      '3. **持续反馈** — 定期自测，查漏补缺\n\n' +
      '> 学习是一个循序渐进的过程，不要急于求成。每天坚持学习，效果会越来越好。\n\n' +
      '我已经为你准备了相关的学习资源，包括入门指南、知识图谱和自测习题。',
    resources: [
      { type: 'doc', title: 'Python 机器学习入门指南', color: '#00d4ff' },
      { type: 'mindmap', title: '知识图谱：ML 学习路线', color: '#7c3aed' },
      { type: 'exercise', title: '入门水平自测习题', color: '#06d6a0' },
    ],
    suggestions: ['继续深入讲解这部分', '给我一个代码示例', '推荐相关学习资源', '有哪些常见的坑？'],
  }
}

function simulateStream(content: string, resources?: ChatResource[], suggestions?: string[]) {
  isStreaming.value = true
  streamContent.value = ''
  let index = 0
  const chars = content.split('')
  const interval = window.setInterval(() => {
    if (index < chars.length) {
      streamContent.value += chars[index]
      index += 1
      scrollToBottom()
      return
    }

    window.clearInterval(interval)
    isStreaming.value = false
    isSending.value = false
    messages.value.push({
      id: Date.now(),
      role: 'assistant',
      content,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      resources,
      suggestions,
    })
    streamContent.value = ''
    resetAgents()
    scrollToBottom()
  }, 25)
}

function runAgentPipeline(finalContent: string, resources?: ChatResource[], suggestions?: string[]) {
  agents.value[0].status = 'active'
  window.setTimeout(() => {
    agents.value[0].status = 'done'
    agents.value[1].status = 'active'
  }, 800)
  window.setTimeout(() => {
    agents.value[1].status = 'done'
    agents.value[2].status = 'active'
  }, 1600)
  window.setTimeout(() => {
    agents.value[2].status = 'done'
    agents.value[3].status = 'active'
  }, 2400)
  window.setTimeout(() => {
    agents.value[3].status = 'done'
    simulateStream(finalContent, resources, suggestions)
  }, 3200)
}

async function sendMessage() {
  const text = inputText.value.trim()
  if ((!text && pendingImages.value.length === 0) || isSending.value || isStreaming.value) return

  selectedPreset.value = ''
  isSending.value = true

  const multimodalContents: MultimodalContent[] = []
  
  if (pendingImages.value.length > 0) {
    pendingImages.value.forEach(img => {
      multimodalContents.push({
        type: 'image',
        imageData: img.dataUrl,
        imageType: img.type,
      })
    })
  }

  if (text) {
    multimodalContents.push({
      type: 'text',
      text,
    })
  }

  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: text,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    multimodalContents,
  })
  
  inputText.value = ''
  pendingImages.value = []
  scrollToBottom()

  // P4-2B-3b：首次发送生成稳定幂等键；网络失败保留，用户重试同一
  // 内容时复用（服务端只落库一次，重试返回首次结果）。内容变化则
  // 换新键——同键不同内容会被服务端 409 拒绝。
  if (!pendingChatKey.value || pendingChatText.value !== text) {
    pendingChatKey.value = createChatIdempotencyKey()
    pendingChatText.value = text
  }
  const idempotencyKey = pendingChatKey.value

  try {
    const reply = await sendChatMessage(text, multimodalContents, { idempotencyKey })
    pendingChatKey.value = null
    pendingChatText.value = ''
    runAgentPipeline(reply.content, reply.resources, reply.suggestions)
  } catch {
    // 失败保留键：下次发送同一内容即重试复用
    const fallback = fallbackChatReply(text)
    runAgentPipeline(fallback.content, fallback.resources, fallback.suggestions)
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  Array.from(target.files).forEach(file => {
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      pendingImages.value.push({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        dataUrl,
        type: file.type,
      })
    }
    reader.readAsDataURL(file)
  })

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function removePendingImage(id: string) {
  pendingImages.value = pendingImages.value.filter(img => img.id !== id)
}

function usePreset(preset: (typeof presets)[number]) {
  selectedPreset.value = preset.label
  inputText.value = `帮我${preset.label}`
  sendMessage()
}

function useSuggestion(suggestion: string) {
  if (suggestion === '去智能辅导提问') {
    router.push('/tutoring')
    return
  }

  inputText.value = suggestion
  sendMessage()
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content)
}

function getResourceIcon(type: ChatResource['type']) {
  return resourceIcons[type] || FileText
}

function formatContent(content: string) {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="cb"><code>$2</code></pre>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/> (.*?)(\n|$)/g, '<blockquote>$1</blockquote>')
    .replace(/\n/g, '<br/>')
}

onMounted(() => {
  scrollToBottom()
  loadChatHistory()
})
</script>

<template>
  <div class="chat">
    <div class="pipeline-bar breathe-subtle">
      <div class="pipeline-flow">
        <div
          v-for="(a, i) in agents"
          :key="a.name"
          :class="['pipeline-node', a.status]"
          :style="{ '--node-color': a.color }"
        >
          <div class="node-indicator">
            <div class="node-ring">
              <component :is="a.icon" v-if="a.status !== 'done'" :size="14" stroke-width="1.5" />
              <span v-else class="node-check">✓</span>
            </div>
            <div v-if="a.status === 'active'" class="node-pulse" />
          </div>
          <div class="node-label">{{ a.name }}</div>
          <div v-if="i < agents.length - 1" class="node-connector">
            <div :class="['connector-track', { filled: a.status === 'done' }]" />
          </div>
        </div>
      </div>
      <button class="pipeline-toggle" @click="showAgentPanel = !showAgentPanel" :aria-expanded="showAgentPanel">
        <Layers :size="14" stroke-width="1.5" />
        <ChevronDown :size="12" :class="['toggle-icon', { open: showAgentPanel }]" />
      </button>
    </div>

    <transition name="slide-up">
      <div v-if="showAgentPanel" class="agent-detail breathe-subtle">
        <div v-for="a in agents" :key="a.name" class="agent-card" :style="{ '--accent': a.color }">
          <div class="agent-card-left">
            <div :class="['agent-badge', a.status]">
              <component :is="a.icon" v-if="a.status !== 'done'" :size="14" stroke-width="1.5" />
              <span v-else class="badge-done">✓</span>
            </div>
            <div class="agent-info">
              <span class="agent-name">{{ a.name }}</span>
              <span class="agent-desc">{{ a.desc }}</span>
            </div>
          </div>
          <span :class="['agent-status-tag', a.status]">
            {{ a.status === 'active' ? '分析中...' : a.status === 'done' ? '已完成' : '待命' }}
          </span>
        </div>
      </div>
    </transition>

    <div class="chat-body">
      <aside class="history-sidebar breathe">
        <div class="sidebar-header">
          <h3 class="sidebar-title">对话历史</h3>
          <button class="sidebar-new">
            <Plus :size="14" stroke-width="2" />
            <span>新建对话</span>
          </button>
        </div>
        <div class="sidebar-search">
          <Search :size="14" stroke-width="1.5" class="search-icon" />
          <input type="text" placeholder="搜索对话..." />
        </div>
        <div class="sidebar-list">
          <button v-for="s in historySessions" :key="s.id" :class="['session-item', { current: s.id === 1 }]">
            <div class="session-category" :class="`cat-${s.id}`">
              {{ s.category }}
            </div>
            <div class="session-info">
              <span class="session-title">{{ s.title }}</span>
              <span class="session-time">{{ s.time }}</span>
            </div>
          </button>
        </div>
        <div class="sidebar-footer">
          <div class="storage-bar">
            <span class="storage-text">存储使用 2.4 / 10 GB</span>
            <div class="storage-track">
              <div class="storage-fill" style="width:24%" />
            </div>
          </div>
        </div>
      </aside>

      <div class="chat-main">
        <div class="messages-container">
          <div v-if="messages.length === 1" class="welcome-section">
            <div class="welcome-header">
              <div class="welcome-badge">
                <Star :size="12" stroke-width="2" />
                <span>你的专属学习助手</span>
              </div>
              <h2 class="welcome-title">晚上好，Alice</h2>
              <p class="welcome-subtitle">我可以帮助你学习任何内容，选择下方功能或直接输入你的问题</p>
            </div>

            <div class="feature-cards-grid">
              <button
                v-for="preset in presets"
                :key="preset.label"
                class="feature-card breathe-subtle"
                :style="{ '--card-color': preset.color }"
                @click="usePreset(preset)"
              >
                <div class="feature-icon-wrapper">
                  <component :is="preset.icon" :size="24" stroke-width="1.5" />
                  <div class="feature-icon-glow" />
                </div>
                <h3 class="feature-title">{{ preset.label }}</h3>
                <p class="feature-desc">{{ preset.desc }}</p>
                <ArrowRight :size="14" class="feature-arrow" />
              </button>
            </div>

            <div class="quick-questions-section breathe-subtle">
              <div class="quick-questions-header">
                <Lightbulb :size="14" stroke-width="1.5" />
                <span>你可能想问</span>
                <button class="refresh-btn">
                  <RotateCcw :size="12" stroke-width="1.5" />
                </button>
              </div>
              <div class="quick-questions-grid">
                <button
                  v-for="q in quickQuestions"
                  :key="q.text"
                  class="quick-question-chip"
                  @click="inputText = q.text; sendMessage()"
                >
                  {{ q.text }}
                  <ArrowRight :size="12" class="question-arrow" />
                </button>
              </div>
            </div>
          </div>

          <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
            <div class="message-avatar">
              <div class="avatar-content">
                {{ msg.role === 'assistant' ? 'AI' : '你' }}
              </div>
            </div>
            <div class="message-body">
              <div class="message-sender">{{ msg.role === 'assistant' ? '智学星枢助手' : '你' }}</div>
              <div v-if="msg.multimodalContents && msg.multimodalContents.length > 0" class="multimodal-container">
                <div v-for="(content, index) in msg.multimodalContents" :key="index">
                  <img v-if="content.type === 'image'" :src="content.imageData" class="message-image" />
                </div>
              </div>
              <div class="message-content" v-html="formatContent(msg.content)" />

              <div v-if="msg.resources?.length" class="resource-chips">
                <div v-for="r in msg.resources" :key="r.title" class="resource-chip" :style="{ '--chip-color': r.color || '#00d4ff' }">
                  <component :is="getResourceIcon(r.type)" :size="14" stroke-width="1.5" />
                  <span>{{ r.title }}</span>
                  <ArrowRight :size="12" class="chip-arrow" />
                </div>
              </div>

              <div v-if="msg.suggestions?.length && msg.role === 'assistant'" class="suggestions">
                <button v-for="s in msg.suggestions" :key="s" class="suggestion-chip" @click="useSuggestion(s)">
                  {{ s }}
                  <ArrowRight :size="11" class="suggestion-arrow" />
                </button>
              </div>

              <div class="message-footer">
                <span class="message-time">{{ msg.time }}</span>
                <div v-if="msg.role === 'assistant'" class="message-actions">
                  <button class="action-btn" @click="copyMessage(msg.content)">
                    <Copy :size="13" stroke-width="1.5" />
                  </button>
                  <button class="action-btn">
                    <ThumbsUp :size="13" stroke-width="1.5" />
                  </button>
                  <button class="action-btn">
                    <ThumbsDown :size="13" stroke-width="1.5" />
                  </button>
                  <button class="action-btn">
                    <RefreshCw :size="13" stroke-width="1.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="isStreaming || isSending" class="message assistant">
            <div class="message-avatar">
              <div class="avatar-content">AI</div>
            </div>
            <div class="message-body">
              <div class="message-sender">智学星枢助手</div>
              <div class="message-content" v-html="formatContent(streamContent || '正在分析中...')" />
              <div class="typing-indicator">
                <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
              </div>
            </div>
          </div>

          <div ref="chatEndRef" />
        </div>

        <div class="input-area breathe-subtle">
          <div class="pending-images" v-if="pendingImages.length > 0">
            <div v-for="img in pendingImages" :key="img.id" class="pending-image-item">
              <img :src="img.dataUrl" class="pending-image-preview" />
              <button class="remove-image-btn" @click="removePendingImage(img.id)">
                <X :size="14" stroke-width="2" />
              </button>
            </div>
          </div>
          <div class="input-wrapper">
            <input
              ref="fileInputRef"
              type="file"
              class="hidden-file-input"
              accept="image/*"
              multiple
              @change="handleFileSelect"
            />
            <button class="input-attach" aria-label="上传附件" @click="fileInputRef?.click()">
              <Paperclip :size="18" stroke-width="1.5" />
            </button>
            <input
              v-model="inputText"
              type="text"
              class="input-field"
              placeholder="输入你的问题或上传图片..."
              @keydown.enter="sendMessage"
              :disabled="isSending || isStreaming"
            />
            <div class="input-commands">
              <span class="cmd-hint">⌘K 命令</span>
              <span class="cmd-hint">@ 提及</span>
            </div>
            <div class="input-mode-selector">
              <button class="mode-btn active">
                <Sparkles :size="14" stroke-width="1.5" />
                <span>深度思考</span>
                <ChevronDown :size="12" stroke-width="1.5" />
              </button>
            </div>
            <button
              :class="['input-send', { active: canSend }]"
              @click="sendMessage"
              :disabled="!canSend"
            >
              <Send v-if="!isSending && !isStreaming" :size="16" stroke-width="2" />
              <span v-else class="sending-dots">···</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-height));
  background: transparent;
  position: relative;
  z-index: 1;
}

.hidden-file-input {
  display: none;
}

.pending-images {
  display: flex;
  gap: 12px;
  padding: 8px 24px;
  flex-wrap: wrap;
}

.pending-image-item {
  position: relative;
  width: 80px;
  height: 80px;
}

.pending-image-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.remove-image-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: transform 0.2s;
}

.remove-image-btn:hover {
  transform: scale(1.1);
}

.multimodal-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}

.message-image {
  max-width: 400px;
  max-height: 300px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  object-fit: contain;
}

.pipeline-bar {
  display: flex;
  align-items: center;
  padding: 0 32px;
  height: 52px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(7, 7, 13, 0.92);
  backdrop-filter: blur(20px);
  gap: 16px;
  flex-shrink: 0;
}

.pipeline-flow {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.pipeline-flow::-webkit-scrollbar { display: none; }

.pipeline-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  flex-shrink: 0;
  transition: all 0.3s var(--ease-out);
}

.node-indicator {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-ring {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.25);
  transition: all 0.3s var(--ease-out);
  z-index: 1;
}

.pipeline-node.active .node-ring {
  background: color-mix(in srgb, var(--node-color) 20%, transparent);
  color: var(--node-color);
  box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 30%, transparent);
}

.pipeline-node.done .node-ring {
  background: color-mix(in srgb, var(--node-color) 25%, transparent);
  color: var(--node-color);
}

.node-check { font-size: 13px; font-weight: 700; }

.node-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--node-color);
  animation: pulse-ring 1.5s ease-out infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.85); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}

.node-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.3);
  white-space: nowrap;
  transition: color 0.3s var(--ease-out);
}

.pipeline-node.active .node-label { color: var(--node-color); }
.pipeline-node.done .node-label { color: rgba(255, 255, 255, 0.7); }

.node-connector {
  width: 24px;
  height: 2px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 1px;
  overflow: hidden;
}

.connector-track {
  height: 100%;
  width: 0;
  border-radius: 1px;
  background: linear-gradient(90deg, var(--node-color), var(--color-accent-cyan));
  transition: width 0.5s var(--ease-out);
}

.connector-track.filled { width: 100%; }

.pipeline-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 12px;
  transition: all 0.2s var(--ease-out);
  flex-shrink: 0;
}

.pipeline-toggle:hover {
  border-color: var(--color-accent-cyan);
  color: var(--color-accent-cyan);
}

.toggle-icon { transition: transform 0.2s var(--ease-out); }
.toggle-icon.open { transform: rotate(180deg); }

.agent-detail {
  padding: 16px 32px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(10, 10, 24, 0.85);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
  transition: all 0.2s var(--ease-out);
}

.agent-card:hover {
  border-color: color-mix(in srgb, var(--accent) 20%, transparent);
}

.agent-card-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-badge {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.agent-badge.active,
.agent-badge.done {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.badge-done { font-weight: 700; }
.agent-info { display: flex; flex-direction: column; gap: 1px; }
.agent-name { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.agent-desc { font-size: 11px; color: var(--color-text-tertiary); }

.agent-status-tag {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 100px;
  font-weight: 500;
}

.agent-status-tag.idle { background: rgba(255, 255, 255, 0.04); color: var(--color-text-tertiary); }
.agent-status-tag.active { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.agent-status-tag.done { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }

.chat-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.history-sidebar {
  width: 260px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  background: rgba(8, 8, 20, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 20px 12px;
}

.sidebar-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 400;
  color: #fff;
  letter-spacing: 0.3px;
}

.sidebar-new {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(124, 58, 237, 0.12));
  color: var(--color-accent-cyan);
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s var(--ease-out);
}

.sidebar-new:hover {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(124, 58, 237, 0.2));
}

.sidebar-search {
  padding: 0 16px 12px;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 26px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  opacity: 0.4;
}

.sidebar-search input {
  width: 100%;
  padding: 8px 12px 8px 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-primary);
  transition: border-color 0.2s var(--ease-out);
}

.sidebar-search input:focus { border-color: var(--color-accent-cyan); }
.sidebar-search input::placeholder { color: var(--color-text-tertiary); opacity: 0.6; }

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  text-align: left;
  border: 1px solid transparent;
  transition: all 0.2s var(--ease-out);
  width: 100%;
}

.session-item:hover {
  background: rgba(0, 212, 255, 0.03);
  border-color: rgba(0, 212, 255, 0.06);
}

.session-item.current {
  background: rgba(0, 212, 255, 0.06);
  border-color: rgba(0, 212, 255, 0.1);
}

.session-category {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.cat-1 { background: rgba(0, 212, 255, 0.12); color: #00d4ff; }
.cat-2 { background: rgba(124, 58, 237, 0.12); color: #7c3aed; }
.cat-3 { background: rgba(6, 214, 160, 0.12); color: #06d6a0; }
.cat-4 { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
.cat-5 { background: rgba(244, 63, 94, 0.12); color: #f43f5e; }
.cat-6 { background: rgba(168, 85, 247, 0.12); color: #a855f7; }

.session-info { flex: 1; min-width: 0; }
.session-title {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  display: block;
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-top: 2px;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

.storage-bar { display: flex; flex-direction: column; gap: 6px; }
.storage-text { font-size: 10px; color: var(--color-text-tertiary); }
.storage-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.storage-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--color-accent-cyan), var(--color-accent-purple));
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: transparent;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.welcome-section {
  padding: 40px 0;
  max-width: 900px;
  margin: 0 auto;
}

.welcome-header {
  text-align: center;
  margin-bottom: 40px;
}

.welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 100px;
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
}

.welcome-title {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 300;
  color: #fff;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--color-text-secondary);
  max-width: 500px;
  margin: 0 auto;
}

.feature-cards-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 40px;
}

.feature-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 24px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.3s var(--ease-out);
  cursor: pointer;
  overflow: hidden;
}

.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--card-color);
  opacity: 0;
  transition: opacity 0.3s var(--ease-out);
}

.feature-card:hover::before { opacity: 1; }

.feature-card:hover {
  border-color: color-mix(in srgb, var(--card-color) 30%, transparent);
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.feature-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--card-color) 8%, transparent);
  color: var(--card-color);
  margin-bottom: 16px;
  transition: all 0.3s var(--ease-out);
}

.feature-icon-glow {
  position: absolute;
  inset: -4px;
  border-radius: 18px;
  background: var(--card-color);
  opacity: 0;
  filter: blur(16px);
  transition: opacity 0.3s var(--ease-out);
}

.feature-card:hover .feature-icon-glow { opacity: 0.2; }
.feature-card:hover .feature-icon-wrapper { transform: scale(1.1); }

.feature-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
  line-height: 1.3;
}

.feature-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 16px;
  flex: 1;
}

.feature-arrow {
  color: var(--card-color);
  transition: transform 0.2s var(--ease-out);
}

.feature-card:hover .feature-arrow { transform: translateX(4px); }

.quick-questions-section {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  padding: 20px 24px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.quick-questions-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.quick-questions-header span {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.refresh-btn {
  margin-left: auto;
  padding: 6px;
  border-radius: 6px;
  color: var(--color-text-tertiary);
  transition: all 0.2s var(--ease-out);
}

.refresh-btn:hover {
  color: var(--color-accent-cyan);
  background: rgba(0, 212, 255, 0.08);
}

.quick-questions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.quick-question-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all 0.2s var(--ease-out);
}

.quick-question-chip:hover {
  border-color: rgba(0, 212, 255, 0.3);
  background: rgba(0, 212, 255, 0.06);
  color: var(--color-accent-cyan);
}

.question-arrow {
  opacity: 0;
  color: var(--color-accent-cyan);
  transition: all 0.2s var(--ease-out);
}

.quick-question-chip:hover .question-arrow {
  opacity: 1;
  transform: translateX(3px);
}

.message {
  display: flex;
  gap: 14px;
  max-width: 780px;
  animation: message-in 0.3s var(--ease-out);
}

.message.user { margin-left: auto; flex-direction: row-reverse; }

@keyframes message-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-avatar { flex-shrink: 0; }

.avatar-content {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.message.assistant .avatar-content {
  background: linear-gradient(135deg, #00d4ff, #3b82f6);
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

.message.user .avatar-content {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

.message-body { flex: 1; min-width: 0; }

.message-sender {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-bottom: 6px;
  display: block;
  letter-spacing: 0.3px;
}

.message-content {
  padding: 14px 18px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  color: var(--color-text-primary);
}

.message.assistant .message-content {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  animation: breathe-subtle 4.5s ease-in-out infinite;
}

.message.user .message-content {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(124, 58, 237, 0.08));
  border: 1px solid rgba(0, 212, 255, 0.1);
}

.message-content :deep(strong) { color: #fff; font-weight: 600; }

.message-content :deep(blockquote) {
  border-left: 2px solid var(--color-accent-cyan);
  padding: 8px 16px;
  margin: 8px 0;
  background: rgba(0, 212, 255, 0.04);
  border-radius: 0 8px 8px 0;
  color: var(--color-text-secondary);
  font-style: italic;
}

.message-content :deep(.cb) {
  display: block;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-accent-cyan);
}

.resource-chips {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.resource-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.resource-chip:hover {
  border-color: var(--chip-color);
  background: color-mix(in srgb, var(--chip-color) 8%, transparent);
}

.resource-chip :first-child { color: var(--chip-color); flex-shrink: 0; }
.chip-arrow { color: var(--color-text-tertiary); opacity: 0; transition: all 0.2s var(--ease-out); }
.resource-chip:hover .chip-arrow { opacity: 1; color: var(--chip-color); transform: translateX(3px); }

.suggestions { margin-top: 10px; }

.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  margin: 0 6px 6px 0;
  border-radius: 100px;
  background: rgba(0, 212, 255, 0.04);
  border: 1px solid rgba(0, 212, 255, 0.1);
  font-size: 12px;
  color: var(--color-text-secondary);
  transition: all 0.2s var(--ease-out);
}

.suggestion-chip:hover {
  border-color: var(--color-accent-cyan);
  background: rgba(0, 212, 255, 0.08);
  color: var(--color-accent-cyan);
}

.suggestion-arrow { opacity: 0; transition: all 0.2s var(--ease-out); }
.suggestion-chip:hover .suggestion-arrow { opacity: 1; transform: translateX(3px); }

.message-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  padding: 0 4px;
}

.message-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

.message-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s var(--ease-out);
}

.message:hover .message-actions { opacity: 1; }
@media (hover: none) { .message-actions { opacity: 1; } }

.action-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--color-text-tertiary);
  transition: all 0.2s var(--ease-out);
}

.action-btn:hover { color: var(--color-accent-cyan); background: rgba(0, 212, 255, 0.08); }

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 4px 0;
}

.typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent-cyan);
  animation: typing-bounce 1.2s ease-in-out infinite;
}

.typing-dot:nth-child(2) { animation-delay: 0.15s; }
.typing-dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes typing-bounce {
  0%, 100% { transform: translateY(0); opacity: 0.3; }
  50% { transform: translateY(-4px); opacity: 1; }
}

.input-area {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--color-border);
  background: rgba(7, 7, 13, 0.85);
  backdrop-filter: blur(20px);
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
  border-radius: 16px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  transition: all 0.2s var(--ease-out);
  max-width: 800px;
  margin: 0 auto;
}

.input-wrapper:focus-within {
  border-color: var(--color-accent-cyan);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.06);
}

.input-attach {
  display: flex;
  padding: 6px;
  color: var(--color-text-tertiary);
  transition: color 0.2s var(--ease-out);
  flex-shrink: 0;
}

.input-attach:hover { color: var(--color-accent-cyan); }

.input-field {
  flex: 1;
  padding: 8px 6px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: transparent;
  border: none;
  outline: none;
  min-height: 24px;
}

.input-field::placeholder { color: var(--color-text-tertiary); opacity: 0.6; }

.input-commands {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.cmd-hint {
  font-size: 10px;
  color: var(--color-text-tertiary);
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  opacity: 0.6;
}

.input-mode-selector {
  display: flex;
  align-items: center;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 12px;
  transition: all 0.2s var(--ease-out);
}

.mode-btn.active {
  background: rgba(0, 212, 255, 0.08);
  border-color: rgba(0, 212, 255, 0.2);
  color: var(--color-accent-cyan);
}

.input-send {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  background: rgba(255, 255, 255, 0.04);
  transition: all 0.2s var(--ease-out);
  flex-shrink: 0;
}

.input-send.active {
  color: #fff;
  background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-blue));
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

.input-send:hover:not(:disabled).active { transform: scale(1.05); }
.sending-dots { letter-spacing: 3px; font-weight: 700; }

@media (max-width: 1024px) {
  .feature-cards-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 768px) {
  .feature-cards-grid { grid-template-columns: repeat(2, 1fr); }
  .history-sidebar { display: none; }
  .messages-container { padding: 20px 16px; }
  .pipeline-bar { padding: 0 16px; }
  .input-area { padding: 12px 12px 16px; }
  .input-commands { display: none; }
  .input-mode-selector { display: none; }
  .welcome-title { font-size: 28px; }
}

@media (max-width: 480px) {
  .feature-cards-grid { grid-template-columns: 1fr; }
}
</style>
