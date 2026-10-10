<template>
  <section class="tutor">
    <h1 class="title">问问 AI 老师</h1>
    <p class="subtitle">把卡住的地方说清楚，AI 会按你的水平调整讲法。</p>

    <form class="ask-box" @submit.prevent="onAsk">
      <textarea
        v-model="question"
        rows="3"
        placeholder="例如：BFS 的 visited 标记在入队时还是出队时打？"
        :disabled="loading"
      />
      <button class="ask-btn" type="submit" :disabled="loading || !question.trim()">
        {{ loading ? '思考中…' : '提问' }}
      </button>
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <article v-if="current" class="answer">
      <header class="answer-head">
        <span class="who">AI 导师</span>
        <span v-if="current.fallback" class="badge badge-warn" title="模型服务不可用，本次为规则降级回答">降级回答</span>
        <span v-if="current.securityRefused" class="badge badge-danger">安全拦截</span>
        <span class="time">{{ current.time }}</span>
      </header>
      <p class="answer-text">{{ current.answer }}</p>
      <ul v-if="current.riskFlags.length" class="risks">
        <li v-for="flag in current.riskFlags" :key="flag">风险标记：{{ flag }}</li>
      </ul>
    </article>

    <section v-if="history.length" class="history">
      <h2 class="history-title">本次会话记录</h2>
      <article v-for="item in history" :key="item.id" class="history-item">
        <p class="q">Q：{{ item.question }}</p>
        <p class="a">A：{{ item.answer }}</p>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { askTutoringQuestion } from '@/lib/api'
import { toFriendlyError } from '../errors'

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
const error = ref('')
const history = ref<QA[]>([])

onMounted(() => {
  document.title = 'AI 导师 · 智学星枢 Mobile'
})

const current = computed(() => history.value[0] ?? null)

async function onAsk() {
  const text = question.value.trim()
  if (!text) return
  loading.value = true
  error.value = ''
  try {
    const reply = await askTutoringQuestion(text, 'qa')
    history.value.unshift({
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
    error.value = formatError(err)
  } finally {
    loading.value = false
  }
}

function formatError(err: unknown): string {
  const friendly = toFriendlyError(err)
  return `${friendly.title}：${friendly.detail}`
}
</script>

<style scoped>
.title {
  font-size: 21px;
  margin: 4px 0 4px;
}

.subtitle {
  color: #6f8ba6;
  font-size: 13px;
  margin: 0 0 18px;
}

.ask-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ask-box textarea {
  background: #0e2033;
  border: 1px solid #285275;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 15px;
  color: #e9f4ff;
  resize: none;
  outline: none;
}

.ask-box textarea:focus {
  border-color: #54d6ff;
}

.ask-btn {
  align-self: flex-end;
  background: linear-gradient(135deg, #1f6feb, #54d6ff);
  border: none;
  border-radius: 10px;
  padding: 10px 26px;
  font-size: 15px;
  font-weight: 600;
  color: #04121f;
  cursor: pointer;
}

.ask-btn:disabled {
  opacity: 0.5;
}

.error {
  background: #3a1620;
  border: 1px solid #6b2233;
  color: #ff9ca8;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  margin: 14px 0 0;
}

.answer {
  margin-top: 18px;
  background: #0e2033;
  border: 1px solid #285275;
  border-radius: 14px;
  padding: 14px 16px;
}

.answer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.who {
  font-size: 13px;
  font-weight: 700;
  color: #54d6ff;
}

.time {
  margin-left: auto;
  font-size: 11px;
  color: #5f7d95;
}

.badge {
  font-size: 11px;
  border-radius: 999px;
  padding: 2px 8px;
}

.badge-warn {
  background: #4a3410;
  color: #ffc857;
}

.badge-danger {
  background: #4d2028;
  color: #ff9ca8;
}

.answer-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.risks {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #ffc857;
}

.history {
  margin-top: 26px;
}

.history-title {
  font-size: 14px;
  color: #8ca8bd;
  margin: 0 0 10px;
}

.history-item {
  border-left: 2px solid #285275;
  padding: 4px 0 4px 12px;
  margin-bottom: 14px;
}

.q,
.a {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.6;
}

.q {
  color: #9eb6ca;
}

.a {
  color: #cddce8;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
