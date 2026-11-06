<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useLearningStore } from '../stores/learning.ts'
import { coveredTopics } from '../logic/tutor.ts'
import { demoCourse } from '../data/course.ts'

const route = useRoute()
const store = useLearningStore()

const input = ref('')
const chatEl = ref<HTMLDivElement | null>(null)

function demoCourseName(kpId: string): string {
  return demoCourse.knowledgePoints.find((k) => k.id === kpId)?.name ?? kpId
}

const GENERAL_QUESTIONS = ['什么是广播？', '缺失值应该删除还是填充？', 'merge 和 concat 的区别？', 'loc 和 iloc 的区别？']

const suggestions = computed(() => {
  const list = [...store.tutorSuggestions]
  for (const q of GENERAL_QUESTIONS) {
    if (list.length >= 5) break
    if (!list.includes(q)) list.push(q)
  }
  return list.slice(0, 5)
})

const messages = computed(() => store.state.chat)

function scrollToBottom() {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  })
}

function send(question?: string) {
  const q = (question ?? input.value).trim()
  if (!q) return
  store.askTutor(q)
  input.value = ''
  scrollToBottom()
}

onMounted(() => {
  const preset = route.query.q
  if (typeof preset === 'string' && preset.trim()) {
    send(preset)
  }
  scrollToBottom()
})
</script>

<template>
  <header>
    <h1 class="page-title">AI 智能导师</h1>
    <p class="page-desc">结合课程知识库回答，针对薄弱知识点讲解，并给出示例与下一步练习推荐</p>
  </header>

  <!-- 演示模式声明（必须明确标注，不得伪装实时模型服务） -->
  <div class="tutor-banner">
    <span style="flex: none">⚠</span>
    <div>
      <b>演示模式说明</b>：当前演示环境未连接后端大模型服务。以下回答来自<b>预置课程知识库的确定性检索</b>
      （覆盖：{{ coveredTopics().join('、') }}），不是实时大模型生成。每个回答均标注引用依据；
      超出课程范围时会明确告知，不会编造答案。
    </div>
  </div>

  <section class="card">
    <div class="section-head" style="margin-bottom: var(--gap-sm)">
      <h2 class="card-title" style="margin: 0">对话</h2>
      <span class="small muted">共 {{ messages.length }} 条消息 · 保存于本机浏览器</span>
    </div>

    <div v-if="messages.length === 0" class="empty-state" style="padding: var(--gap)">
      <span class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 3a6 6 0 0 1 6 6c0 2.4-1.2 4.2-2.6 5.4-.9.8-1.4 1.4-1.4 2.6h-4c0-1.2-.5-1.8-1.4-2.6C7.2 13.2 6 11.4 6 9a6 6 0 0 1 6-6z" />
          <path d="M9.5 20.5h5" />
        </svg>
      </span>
      <p class="small muted">向我提问《{{ 'Python 数据分析基础' }}》课程相关问题，或点击下方推荐问题开始。</p>
    </div>

    <div ref="chatEl" class="chat-list">
      <template v-for="msg in messages" :key="msg.id">
        <div v-if="msg.role === 'user'" class="chat-msg user">{{ msg.text }}</div>
        <div v-else class="chat-msg tutor">
          <div class="tutor-answer-title">{{ msg.title }}</div>
          <div style="white-space: pre-wrap">{{ msg.text }}</div>

          <div v-if="msg.example" class="tutor-example">{{ msg.example }}</div>

          <div v-if="msg.pitfalls && msg.pitfalls.length > 0" style="margin-top: 10px">
            <b>常见错误：</b>
            <ul class="tutor-pitfalls">
              <li v-for="pitfall in msg.pitfalls" :key="pitfall">{{ pitfall }}</li>
            </ul>
          </div>

          <div v-if="msg.relatedExercises && msg.relatedExercises.length > 0" style="margin-top: 10px">
            <b>推荐练习：</b>
            <ul class="tutor-pitfalls">
              <li v-for="ex in msg.relatedExercises" :key="ex.id">
                <RouterLink :to="`/practice/${msg.kpId}`">{{ ex.prompt }}</RouterLink>
              </li>
            </ul>
          </div>

          <div class="tutor-source">
            <span v-if="msg.matched">
              引用依据：{{ msg.source }}
              <span v-if="msg.matchedTerms && msg.matchedTerms.length > 0" class="muted">
                · 检索命中词项：{{ msg.matchedTerms.slice(0, 6).join('、') }}
              </span>
            </span>
            <span v-else class="muted">未命中演示知识库（演示模式：不生成无依据的回答）</span>
          </div>

          <div v-if="msg.followUps && msg.followUps.length > 0" class="chip-row" style="margin-top: 10px">
            <button v-for="follow in msg.followUps.slice(0, 3)" :key="follow" class="chip" @click="send(follow)">
              {{ follow }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="chat-input-row no-print">
      <input
        v-model="input"
        class="chat-input"
        type="text"
        placeholder="输入课程相关问题，例如：什么是广播？"
        aria-label="向 AI 导师提问"
        @keyup.enter="send()"
      />
      <button class="btn btn-primary" :disabled="!input.trim()" @click="send()">发送</button>
    </div>

    <div class="chip-row" style="margin-top: var(--gap-sm)">
      <span class="small muted" style="align-self: center">推荐问题：</span>
      <button v-for="q in suggestions" :key="q" class="chip" @click="send(q)">{{ q }}</button>
    </div>
  </section>

  <section v-if="store.weakKps.length > 0" class="card no-print">
    <h2 class="card-title">针对你的薄弱知识点</h2>
    <p class="small muted" style="margin-bottom: var(--gap-sm)">
      以下知识点掌握度低于 40%（演示评估值），建议优先向导师提问并完成练习：
    </p>
    <div class="chip-row">
      <RouterLink
        v-for="kp in store.weakKps"
        :key="kp.kpId"
        :to="`/practice/${kp.kpId}`"
        class="chip"
      >
        {{ demoCourseName(kp.kpId) }}（{{ Math.round(kp.mastery) }}%）→ 去练习
      </RouterLink>
    </div>
  </section>
</template>
