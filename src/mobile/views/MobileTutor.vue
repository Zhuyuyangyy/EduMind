<template>
  <section class="tutor">
    <div class="tutor__intro">
      <h1 class="tutor__title">你卡在了哪一步？</h1>
      <p class="tutor__subtitle">把问题说清楚，AI 会按你的掌握程度启发式讲解。</p>
    </div>

    <!-- 今日主题上下文（从今日学习页携带，可追溯） -->
    <div v-if="topicContext" class="tutor__topic">
      <div class="tutor__topic-body">
        <span class="m-badge m-badge--info">今日主题</span>
        <span class="tutor__topic-name">{{ topicContext.name }}</span>
        <span class="tutor__topic-id">#{{ topicContext.id }}</span>
      </div>
      <button class="m-btn m-btn--ghost m-btn--sm" @click="onUseTopic">就聊这个</button>
    </div>

    <!-- 历史加载中 -->
    <div v-if="historyLoading" class="tutor__thread">
      <div class="m-skeleton m-skeleton--text" style="width: 70%" />
      <div class="m-skeleton m-skeleton--text" style="width: 55%" />
      <div class="m-skeleton m-skeleton--block" />
    </div>

    <!-- 对话区（真实数据） -->
    <div v-else class="tutor__thread" ref="thread">
      <MobileEmpty
        v-if="!messages.length && !loading"
        title="还没有提问"
        desc="先问我一个问题，例如「BFS 的 visited 什么时候标记？」"
      />

      <template v-for="item in messages" :key="item.id">
        <div class="m-bubble m-bubble--user">{{ item.question }}</div>
        <div class="tutor__ai">
          <div class="m-bubble__meta">
            <span>AI 导师</span>
            <span v-if="item.source === 'fallback'" class="m-badge m-badge--warn" title="模型服务不可用，本次为规则降级回答">降级回答</span>
            <span v-else-if="item.source === 'unknown'" class="m-badge" title="该历史记录早于来源标注功能，无法确认生成方式">来源未记录</span>
            <span v-else class="m-badge m-badge--success" title="本次回答来自真实模型">模型生成</span>
            <span v-if="item.time">{{ item.time }}</span>
          </div>
          <div class="m-bubble m-bubble--ai">{{ item.answer }}</div>
        </div>
      </template>

      <!-- 思考中骨架（加载态） -->
      <div v-if="loading" class="tutor__ai">
        <div class="m-bubble__meta"><span>AI 导师</span><span>思考中…</span></div>
        <div class="m-bubble m-bubble--ai tutor__thinking">
          <div class="m-skeleton m-skeleton--text" style="width: 88%" />
          <div class="m-skeleton m-skeleton--text" style="width: 96%" />
          <div class="m-skeleton m-skeleton--text" style="width: 64%; margin-bottom: 0" />
        </div>
      </div>
    </div>

    <!-- 历史加载失败 -->
    <div v-if="historyError" class="m-error tutor__error" role="alert">
      <b>历史记录加载失败</b>
      <span class="m-error__detail">{{ historyError }}</span>
      <button class="m-btn m-btn--ghost m-btn--sm tutor__retry" @click="loadHistory">重试</button>
    </div>

    <!-- 错误 + 重试 -->
    <div v-if="error" class="m-error tutor__error" role="alert">
      <b>{{ error.title }}</b>
      <span class="m-error__detail">{{ error.detail }}</span>
      <button class="m-btn m-btn--ghost m-btn--sm tutor__retry" @click="onAsk">重试</button>
    </div>

    <!-- 输入区（键盘弹出时保持可见） -->
    <form class="tutor__composer" :class="{ 'tutor__composer--focused': focused }" @submit.prevent="onAsk">
      <textarea
        v-model="question"
        class="m-textarea"
        rows="2"
        placeholder="例如：BFS 的 visited 标记在入队时还是出队时打？"
        :disabled="loading"
        @focus="focused = true"
        @blur="focused = false"
      />
      <button class="m-btn m-btn--primary tutor__send" type="submit" :disabled="loading || !question.trim()">
        {{ loading ? '思考中' : '提问' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import MobileEmpty from '../components/MobileEmpty.vue'
import { useRoute } from 'vue-router'
import { askTutoringQuestion } from '@/lib/api'
import { toFriendlyError, type FriendlyError } from '../errors'
import {
  fetchTutoringHistoryItems,
  historyToMessages,
  replyToMessage,
} from '@/mobile/data/learning-data'
import type { TutorMessage } from '@/mobile/data/types'

const route = useRoute()
const question = ref('')
const loading = ref(false)
const focused = ref(false)
const error = ref<FriendlyError | null>(null)
const historyLoading = ref(true)
const historyError = ref('')
const messages = ref<TutorMessage[]>([])
const thread = ref<HTMLElement | null>(null)

/** 今日主题上下文（query: topic=<id>&name=<名称>，来自今日学习页） */
const topicContext = computed<{ id: string; name: string } | null>(() => {
  const id = typeof route.query.topic === 'string' ? route.query.topic : ''
  const name = typeof route.query.name === 'string' ? route.query.name : ''
  return id ? { id, name: name || id } : null
})

onMounted(async () => {
  document.title = 'AI 导师 · 智学星枢 Mobile'
  await loadHistory()
  // 携带主题进入时预填问题，用户可改
  if (topicContext.value) {
    question.value = `我想学习「${topicContext.value.name}」，请从基础开始带我理解`
  }
})

watch(() => route.query.topic, () => {
  if (topicContext.value && !question.value.trim()) {
    question.value = `我想学习「${topicContext.value.name}」，请从基础开始带我理解`
  }
})

async function loadHistory() {
  historyLoading.value = true
  historyError.value = ''
  try {
    const result = await fetchTutoringHistoryItems()
    if (result.stale) return // 过期响应（切号/退出），丢弃
    if (result.error || result.items === null) {
      // P3-0：历史加载失败与「没有历史」是两件事，分别提示
      historyError.value = result.error || '加载失败'
      return
    }
    // 服务端为唯一事实来源：整体替换，避免与本地追加重复展示
    messages.value = historyToMessages(result.items)
  } catch (err) {
    historyError.value = err instanceof Error ? err.message : '未知错误'
  } finally {
    historyLoading.value = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
  })
}

async function onAsk() {
  const text = question.value.trim()
  if (!text || loading.value) return
  loading.value = true
  error.value = null
  try {
    const reply = await askTutoringQuestion(text, 'qa')
    // 先本地展示（即时反馈），再以服务端历史刷新替换（防重复）
    messages.value = [...messages.value, replyToMessage({
      question: text,
      answer: reply.answer,
      time: reply.time || '',
      fallbackAgents: reply.fallbackAgents || [],
    })]
    question.value = ''
    scrollToBottom()
    await loadHistory()
    scrollToBottom()
  } catch (err) {
    error.value = toFriendlyError(err)
  } finally {
    loading.value = false
  }
}

function onUseTopic() {
  if (!topicContext.value) return
  question.value = `我想学习「${topicContext.value.name}」，请从基础开始带我理解`
}
</script>

<style scoped>
.tutor__topic {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  background: var(--m-primary-soft);
  border: 1px solid rgba(84, 214, 255, 0.25);
  border-radius: var(--m-radius-md);
  padding: var(--m-space-2) var(--m-space-3);
  margin-bottom: var(--m-space-3);
}

.tutor__topic-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--m-space-2);
  min-width: 0;
  flex: 1;
}

.tutor__topic-name {
  font-size: var(--m-text-md);
  font-weight: 600;
}

.tutor__topic-id {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.tutor__intro {
  margin-bottom: var(--m-space-4);
}

.tutor__title {
  font-size: var(--m-text-xl);
  margin: 0 0 var(--m-space-1);
}

.tutor__subtitle {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: 0;
}

.tutor__thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
  overflow-y: auto;
  padding-bottom: var(--m-space-4);
}

.tutor__ai {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--m-space-1);
}

.tutor__thinking {
  min-width: 180px;
}

.tutor__error {
  margin-bottom: var(--m-space-3);
}

.tutor__retry {
  align-self: flex-start;
  margin-top: var(--m-space-2);
}

/* 输入区：sticky 在底部，键盘弹出时随视口上移（dvh + sticky） */
.tutor__composer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: var(--m-space-2);
  align-items: flex-end;
  padding: var(--m-space-3) 0 var(--m-space-2);
  background: var(--m-bg);
  border-top: 1px solid var(--m-border);
}

.tutor__composer .m-textarea {
  flex: 1;
}

.tutor__send {
  flex: none;
  padding: var(--m-space-3) var(--m-space-5);
}

.tutor__composer--focused {
  border-top-color: var(--m-primary);
}
</style>
