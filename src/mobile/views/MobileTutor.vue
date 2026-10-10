<template>
  <section class="tutor">
    <div class="tutor__intro">
      <h1 class="tutor__title">你卡在了哪一步？</h1>
      <p class="tutor__subtitle">把问题说清楚，AI 会按你的掌握程度启发式讲解。</p>
    </div>

    <!-- 对话区（真实数据） -->
    <div class="tutor__thread">
      <div v-if="!history.length && !loading" class="m-empty">
        <span class="m-empty__icon">✦</span>
        <p class="m-empty__text">还没有提问<br />先问我一个问题，例如「BFS 的 visited 什么时候标记？」</p>
      </div>

      <template v-for="item in orderedHistory" :key="item.id">
        <div class="m-bubble m-bubble--user">{{ item.question }}</div>
        <div class="tutor__ai">
          <div class="m-bubble__meta">
            <span>AI 导师</span>
            <span v-if="item.fallback" class="m-badge m-badge--warn" title="模型服务不可用，本次为规则降级回答">降级回答</span>
            <span v-if="item.securityRefused" class="m-badge m-badge--danger">安全拦截</span>
            <span v-if="item.time">{{ item.time }}</span>
          </div>
          <div class="m-bubble m-bubble--ai">{{ item.answer }}</div>
          <ul v-if="item.riskFlags.length" class="tutor__risks">
            <li v-for="flag in item.riskFlags" :key="flag">风险标记：{{ flag }}</li>
          </ul>
        </div>
      </template>

      <!-- 思考中骨架（P2-1 加载态） -->
      <div v-if="loading" class="tutor__ai">
        <div class="m-bubble__meta"><span>AI 导师</span><span>思考中…</span></div>
        <div class="m-bubble m-bubble--ai tutor__thinking">
          <div class="m-skeleton m-skeleton--text" style="width: 88%" />
          <div class="m-skeleton m-skeleton--text" style="width: 96%" />
          <div class="m-skeleton m-skeleton--text" style="width: 64%; margin-bottom: 0" />
        </div>
      </div>
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
import { computed, nextTick, onMounted, onUpdated, ref } from 'vue'
import { askTutoringQuestion } from '@/lib/api'
import { toFriendlyError, type FriendlyError } from '../errors'

interface QA {
  id: number
  question: string
  answer: string
  time: string
  fallback: boolean
  securityRefused: boolean
  riskFlags: string[]
}

const question = ref('')
const loading = ref(false)
const focused = ref(false)
const error = ref<FriendlyError | null>(null)
const history = ref<QA[]>([])
const thread = ref<HTMLElement | null>(null)

onMounted(() => {
  document.title = 'AI 导师 · 智学星枢 Mobile'
})

onUpdated(() => {
  // 新消息滚动到底部
  nextTick(() => {
    if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
  })
})

const orderedHistory = computed(() => [...history.value].reverse())

async function onAsk() {
  const text = question.value.trim()
  if (!text || loading.value) return
  loading.value = true
  error.value = null
  try {
    const reply = await askTutoringQuestion(text, 'qa')
    history.value.push({
      id: Date.now(),
      question: text,
      answer: reply.answer,
      time: reply.time || '',
      fallback: (reply.fallbackAgents || []).length > 0,
      securityRefused: Boolean(reply.securityRefused),
      riskFlags: reply.riskFlags || [],
    })
    question.value = ''
  } catch (err) {
    error.value = toFriendlyError(err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.tutor {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 140px);
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

.tutor__risks {
  margin: 0;
  padding-left: var(--m-space-4);
  font-size: var(--m-text-xs);
  color: var(--m-warn);
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
