<template>
  <section class="tutor">
    <nav class="tutor__modes" aria-label="导师服务">
      <RouterLink to="/planning">制定学习计划</RouterLink>
      <span aria-current="page">学科辅导</span>
    </nav>
    <div class="tutor__intro"><span class="tutor__symbol"><MobileIcon name="sparkle" :size="21" /></span><div><h1 class="tutor__title">一起，把问题想明白。</h1><p class="tutor__subtitle">可以从一个概念，也可以从一次不理解开始。</p></div></div>

    <!-- 今日主题上下文（从今日学习页携带，可追溯） -->
    <div v-if="topicContext" class="tutor__topic">
      <div class="tutor__topic-body">
        <span class="m-badge m-badge--info">今日主题</span>
        <span class="tutor__topic-name">{{ topicContext.name }}</span>

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
      <div v-if="!messages.length && !loading" class="tutor__welcome">
        <MobileOrbit class="tutor__welcome-orbit" />
        <h2>每个好问题，都是一个起点。</h2>
        <p>试着从下面开始，或直接写下你的困惑。</p>
        <div class="tutor__starters" aria-label="快捷提问">
          <button v-for="starter in starters" :key="starter.label" type="button" @click="useStarter(starter.prompt)"><MobileIcon :name="starter.icon" :size="16" /><span>{{ starter.label }}</span><MobileIcon name="chevronRight" :size="13" /></button>
        </div>
      </div>

      <template v-for="item in messages" :key="item.id">
        <div class="m-bubble m-bubble--user">{{ item.question }}</div>
        <div class="tutor__ai">
          <div class="m-bubble__meta">
            <span>AI 导师</span>
            <span v-if="item.source === 'fallback'" class="m-badge m-badge--warn" title="模型服务不可用，本次为规则降级回答">降级回答</span>
            <span v-else-if="item.source === 'unknown'" class="m-badge" title="该历史记录早于来源标注功能，无法确认生成方式">来源未记录</span>
            <span v-else class="m-badge m-badge--success" title="本次回答来自真实模型">模型生成</span>
            <time v-if="item.time" :datetime="item.time">{{ formatMessageTime(item.time) }}</time>
          </div>
          <div class="m-bubble m-bubble--ai"><MobileTutorAnswer :text="item.answer" /></div>
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
        aria-label="向 AI 导师提问"
        placeholder="把你的问题写在这里…"
        :disabled="loading"
        @focus="focused = true"
        @blur="focused = false"
      />
      <button class="m-btn m-btn--primary tutor__send" type="submit" :aria-label="loading ? '思考中' : '发送问题'" :disabled="loading || !question.trim()">
        <ArrowUp :size="19" /><span class="tutor__send-label">{{ loading ? '思考中' : '提问' }}</span>
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import MobileOrbit from '../components/MobileOrbit.vue'
import MobileTutorAnswer from '../components/MobileTutorAnswer.vue'
import MobileIcon, { type IconName } from '../components/MobileIcon.vue'
import { ArrowUp } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { askTutoringQuestion } from '@/lib/api'
import { toFriendlyError, type FriendlyError } from '../errors'
import {
  fetchTutoringHistoryItems,
  historyToMessages,
  replyToMessage,
} from '@/mobile/data/learning-data'
import type { TutorMessage } from '@/mobile/data/types'

const starters: Array<{ label: string; prompt: string; icon: IconName }> = [
  { label: '把一个概念讲简单一点', prompt: '请用一个生活中的例子，为我讲解这个知识点：', icon: 'book' },
  { label: '带我一步一步想', prompt: '请不要直接给答案，用问题引导我理解：', icon: 'path' },
  { label: '用一道题检验理解', prompt: '请给我一道关于当前学习主题的练习题，先不要展示答案。', icon: 'practice' },
]
function useStarter(prompt: string) {
  question.value = topicContext.value ? `${prompt}「${topicContext.value.name}」` : prompt
  nextTick(() => document.querySelector<HTMLTextAreaElement>('.tutor__composer textarea')?.focus())
}
function formatMessageTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? (value.length < 16 ? value : '历史记录') : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' })
}
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
.tutor { display: flex; flex-direction: column; height: calc(100dvh - 196px); min-height: 490px; }
.tutor__modes { display: flex; gap: 4px; background: #e9ecf4; padding: 4px; border-radius: 14px; flex: none; margin-bottom: 22px; }
.tutor__modes > * { flex: 1; text-align: center; padding: 11px 6px; font-size: 12px; color: var(--m-text-dim); text-decoration: none; border-radius: 10px; }
.tutor__modes > span { background: var(--m-surface); color: var(--m-text); box-shadow: var(--m-shadow-card); font-weight: 600; }
.tutor__intro { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex: none; }
.tutor__symbol { width: 42px; height: 44px; display: grid; place-items: center; border-radius: 14px; color: var(--m-primary); background: var(--m-primary-soft); flex: none; }
.tutor__title { font-size: 22px; letter-spacing: -.7px; margin: 0 0 7px; }
.tutor__subtitle { font-size: 11px; color: var(--m-text-faint); margin: 0; line-height: 1.7; }
.tutor__topic { display: flex; gap: 10px; align-items: center; padding: 10px 12px; background: var(--m-surface); border: 1px solid var(--m-border); border-radius: 16px; margin-top: 12px; flex: none; }
.tutor__topic-body { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; flex: 1; }
.tutor__topic-name { font-size: 12px; }
.tutor__topic .m-btn { font-size: 11px; padding-inline: 10px; flex: none; }
.tutor__thread { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; padding: 18px 0; scrollbar-width: thin; overscroll-behavior: contain; }
.tutor__welcome { margin: auto 0; padding: 6px 4px 8px; text-align: center; }
.tutor__welcome-orbit { width: 110px; height: 90px; object-fit: cover; margin: 0 auto 4px; }
.tutor__welcome h2 { font-size: 16px; letter-spacing: -.4px; margin: 0 0 8px; }
.tutor__welcome > p { color: var(--m-text-faint); font-size: 11px; margin: 0 0 20px; }
.tutor__starters { display: grid; gap: 8px; text-align: left; }
.tutor__starters button { display: flex; align-items: center; gap: 10px; min-height: 45px; padding: 11px 14px; border: 1px solid var(--m-border); border-radius: 13px; background: var(--m-surface); color: var(--m-text-dim); font: inherit; font-size: 12px; cursor: pointer; }
.tutor__starters button > .m-icon:first-child { color: var(--m-primary); }
.tutor__starters button > .m-icon:last-child { margin-left: auto; color: var(--m-text-faint); }
.tutor__ai { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; }
.tutor__ai .m-bubble { max-width: 94%; }
.tutor .m-bubble { font-size: 14px; line-height: 1.8; }
.tutor__thinking { min-width: 180px; }
.tutor__error { flex: none; margin-bottom: 10px; }
.tutor__retry { align-self: flex-start; margin-top: 6px; }
.tutor__composer { display: flex; gap: 10px; align-items: flex-end; padding: 10px; flex: none; border: 1px solid var(--m-border-strong); background: var(--m-surface); border-radius: 22px; box-shadow: var(--m-shadow-card); }
.tutor__composer .m-textarea { flex: 1; min-width: 0; background: transparent; border: 0; padding: 8px 4px 5px 8px; font-size: 16px; line-height: 1.5; }
.tutor__composer .m-textarea:focus-visible { outline-offset: -2px; border-radius: 12px; }
.tutor__composer--focused { border-color: var(--m-primary); }
.tutor__send { display: grid; place-items: center; border-radius: 50%; min-width: 42px; width: 42px; min-height: 42px; height: 42px; padding: 0; flex: none; }
.tutor__send-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 359px) { .tutor__title { font-size: 20px; } }
</style>
