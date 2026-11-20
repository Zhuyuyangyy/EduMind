<template>
  <aside
    class="bg-transparent flex flex-col h-full transition-all duration-300 overflow-hidden shrink-0"
    :class="[
      isAiSidebarOpen ? 'w-[440px] opacity-100' : 'w-0 p-0 opacity-0 pointer-events-none'
    ]"
    :style="{
      borderRight: side === 'left' ? '1px solid var(--border-subtle)' : undefined,
      borderLeft: side === 'right' ? '1px solid var(--border-subtle)' : undefined,
    }"
  >
    <!-- Header -->
    <div class="p-4 shrink-0 flex items-center justify-between" style="border-bottom: 1px solid var(--border-card)">
      <div class="flex items-center gap-2">
        <div class="relative">
          <Tv class="w-4 h-4" :class="statusIconClass" />
          <span class="absolute -top-1 -right-1 flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              :class="avatarStatus === 'connected' ? 'bg-emerald-400' : 'bg-blue-400'" />
            <span class="relative inline-flex rounded-full h-2 w-2"
              :class="avatarStatus === 'connected' ? 'bg-emerald-500' : 'bg-blue-500'" />
          </span>
        </div>
        <div>
          <h3 class="text-xs font-bold text-white leading-tight">AI 虚拟互动舱</h3>
          <div class="text-[10px]" style="color: var(--text-muted)">AI Virtual Human Pro</div>
        </div>
      </div>
      <button @click="isAiSidebarOpen = false" class="p-0.5 rounded transition-colors cursor-pointer" style="color: var(--text-muted); hover: color: var(--text-secondary)" title="隐藏互动舱">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Content Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Avatar Stage -->
      <div
        ref="avatarStageRef"
        class="relative rounded-2xl border overflow-hidden flex flex-col transition-all duration-300 group h-[800px]"
        style="background: transparent; border-color: rgba(59, 130, 246, 0.05)"
      >
        <div class="absolute inset-0 pointer-events-none" style="background-image: radial-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px); background-size: 12px 12px; opacity: 0.3" />

        <!-- Status bar -->
        <div class="relative z-10 flex justify-between items-center text-[10px] p-3">
          <span class="px-2 py-0.5 rounded-full border font-mono scale-90 transition-colors uppercase"
            :class="statusBadgeClass">
            ● {{ statusText }}
          </span>
          <span class="font-mono scale-90 text-[9px]" style="color: var(--text-muted)">
            {{ avatarStatus === 'loading' ? 'SPARK: CONNECTING' : avatarStatus === 'connected' ? 'SYS: LIVE' : 'SYS: STANDBY' }}
          </span>
        </div>

        <!-- Avatar Render Container -->
        <div ref="avatarContainerRef" class="relative z-10 flex-1"
          :class="{ 'cursor-pointer': avatarStatus !== 'connected' }"
          @click="handleStageClick">
          <div ref="avatarWrapperRef" class="w-full rounded-lg overflow-hidden absolute inset-0"
            :style="avatarStatus === 'connected' ? '' : 'opacity: 0.3'" />

          <!-- Idle placeholder -->
          <div v-if="avatarStatus !== 'connected'" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 gap-3">
            <div class="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center" style="border-color: rgba(59, 130, 246, 0.25)">
              <Tv class="w-7 h-7" style="color: rgba(59, 130, 246, 0.4)" />
            </div>
            <div class="text-center space-y-1">
              <p class="text-sm font-bold tracking-wider" style="color: rgba(96, 165, 250, 0.6)">AI VIRTUAL TUTOR</p>
              <p class="text-[10px]" style="color: var(--text-muted)">3D 虚拟导师待机中</p>
            </div>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: rgba(59, 130, 246, 0.4)" />
              <span class="text-[9px] font-mono" style="color: var(--text-muted)">STANDBY</span>
            </div>
          </div>

          <!-- Loading overlay -->
          <div v-if="avatarStatus === 'loading'" class="absolute inset-0 rounded-xl flex flex-col items-center justify-center z-30" style="background: rgba(59, 130, 246, 0.08); backdrop-filter: blur(4px)">
            <Tv class="w-8 h-8 mb-2 animate-bounce" style="color: var(--gold-400)" />
            <span class="text-xs text-white font-bold">正在连接虚拟人服务...</span>
            <span class="text-[10px] mt-1" style="color: var(--text-muted)">初始化大语言模型引擎</span>
          </div>

          <!-- Play not allowed overlay -->
          <div v-if="playNotAllowed" class="absolute inset-0 rounded-xl flex flex-col items-center justify-center z-30" style="background: rgba(59, 130, 246, 0.08); backdrop-filter: blur(4px)">
            <div class="text-center">
              <div class="text-3xl mb-2">&#128266;</div>
              <h4 class="text-xs font-bold text-white">点击恢复播放</h4>
              <p class="text-[10px] mt-1" style="color: var(--text-muted)">浏览器限制了自动播放</p>
              <button @click.stop="handleResume" class="mt-3 py-2 px-4 text-white font-bold rounded-xl text-xs transition-all cursor-pointer border-none"
                style="background: linear-gradient(135deg, var(--gold-500), var(--gold-600))">
                恢复播放
              </button>
            </div>
          </div>
        </div>

        <!-- Subtitle -->
        <div class="relative z-10 border rounded-xl mx-3 mb-3 px-2.5 py-2 text-left max-h-[72px] overflow-y-auto"
          style="background: rgba(59, 130, 246, 0.04); border-color: rgba(59, 130, 246, 0.05)">
          <p class="text-[10px] font-medium leading-relaxed animate-fade-in whitespace-pre-line" style="color: var(--gold-300)">
            {{ currentSubtitle }}
          </p>
        </div>
      </div>

      <!-- Card 1: 语音交互 -->
      <div class="glass-card rounded-2xl p-3.5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between text-[10px] font-bold tracking-wider" style="color: var(--text-muted)">
          <span class="flex items-center gap-1.5">
            <Mic class="w-3.5 h-3.5" style="color: var(--gold-400)" />
            语音交互
          </span>
          <span class="text-[8px] font-mono" :class="isRecording ? 'text-rose-400' : (avatarStatus === 'connected' ? 'text-emerald-400' : '')" style="color: avatarStatus !== 'connected' && !isRecording ? 'var(--text-muted)' : undefined">
            {{ isRecording ? '● REC' : (avatarStatus === 'connected' ? 'READY' : 'OFFLINE') }}
          </span>
        </div>
        <div class="h-7 rounded-lg border p-1.5 flex items-center justify-between overflow-hidden" style="background: rgba(59, 130, 246, 0.06); border-color: var(--border-card)">
          <div class="flex items-center gap-1">
            <Mic class="w-3 h-3" :class="isRecording ? 'text-rose-500 animate-pulse' : ''" style="color: isRecording ? undefined : 'var(--gold-400)'" />
            <span class="text-[9px] font-medium" style="color: var(--text-muted)">
              {{ isRecording ? '正在聆听...' : (avatarStatus === 'connected' ? '等待语音交互' : '虚拟人未连接') }}
            </span>
          </div>
          <div class="flex items-end gap-0.5 h-full pb-0.5">
            <span v-for="i in 8" :key="i" class="w-0.5 rounded-full transition-all duration-200"
              :class="[isRecording ? 'animate-pulse' : 'opacity-40', isRecording ? (i % 3 === 0 ? 'h-4' : i % 2 === 0 ? 'h-3' : 'h-2') : 'h-1']"
              :style="{ background: isRecording ? 'var(--gold-400)' : 'var(--text-dim)' }" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button @click="handleFullDuplex" :disabled="avatarStatus !== 'connected'"
            class="py-2 rounded-xl text-[10px] font-bold text-white transition-all cursor-pointer border-none flex items-center justify-center gap-1 disabled:opacity-30"
            :class="isRecording ? 'bg-rose-600 hover:bg-rose-500' : ''"
            :style="!isRecording ? { background: 'linear-gradient(135deg, var(--gold-500), var(--gold-600))' } : {}"
          >
            <Mic class="w-3 h-3" :class="isRecording && 'animate-pulse'" />
            {{ isRecording ? '停止聆听' : '全双工对话' }}
          </button>
          <button @click="handleShortVoice" :disabled="avatarStatus !== 'connected' || isRecording"
            class="py-2 rounded-xl text-[10px] font-bold text-white transition-all cursor-pointer border-none flex items-center justify-center gap-1 disabled:opacity-30"
            style="background: rgba(59, 130, 246, 0.15); border: 1px solid var(--border-card); color: var(--text-secondary)">
            <AudioLines class="w-3 h-3" />
            短语音 10s
          </button>
        </div>
      </div>

      <!-- Card 2: 文本驱动 -->
      <div class="glass-card rounded-2xl p-3.5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between text-[10px] font-bold tracking-wider" style="color: var(--text-muted)">
          <span class="flex items-center gap-1.5">
            <MessageSquare class="w-3.5 h-3.5" style="color: var(--gold-400)" />
            文本驱动
          </span>
          <div class="flex items-center gap-1.5">
            <label for="nlp-toggle" class="text-[8px] cursor-pointer select-none" :class="useNlp ? 'text-emerald-400' : ''" style="color: useNlp ? undefined : 'var(--text-muted)'">
              {{ useNlp ? '语义理解' : '纯文本' }}
            </label>
            <input type="checkbox" v-model="useNlp" id="nlp-toggle" class="h-2.5 w-2.5 rounded accent-blue-500 cursor-pointer" />
          </div>
        </div>
        <div class="flex gap-2">
          <input v-model="textInput" @keyup.enter="handleSendText" :disabled="avatarStatus !== 'connected'"
            :placeholder="avatarStatus === 'connected' ? '输入文本让虚拟人播报...' : '请先连接虚拟人'"
            class="flex-1 text-[10px] rounded-lg px-2.5 py-2 outline-none transition-colors placeholder:font-medium disabled:opacity-40"
            style="background: rgba(59, 130, 246, 0.06); border: 1px solid var(--border-input); color: var(--text-secondary)" />
          <button @click="handleSendText" :disabled="avatarStatus !== 'connected' || !textInput.trim()"
            class="px-3 py-2 rounded-lg text-[10px] font-bold text-white transition-all cursor-pointer border-none shrink-0 disabled:opacity-30"
            :style="avatarStatus === 'connected' && textInput.trim() ? { background: 'linear-gradient(135deg, var(--gold-500), var(--gold-600))' } : { background: 'rgba(59, 130, 246, 0.08)', color: 'var(--text-dim)', border: '1px solid var(--border-card)' }"
          >
            发送
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="q in quickTexts" :key="q.label" @click="textInput = q.text" :disabled="avatarStatus !== 'connected'"
            class="text-[8px] px-2 py-1 rounded-md transition-all cursor-pointer disabled:opacity-30"
            style="background: rgba(59, 130, 246, 0.06); border: 1px solid var(--border-card); color: var(--text-muted)">
            {{ q.label }}
          </button>
        </div>
      </div>

      <!-- Card 3: 播报控制 -->
      <div class="glass-card rounded-2xl p-3.5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between text-[10px] font-bold tracking-wider" style="color: var(--text-muted)">
          <span class="flex items-center gap-1.5">
            <SlidersHorizontal class="w-3.5 h-3.5" style="color: var(--gold-400)" />
            播报控制
          </span>
          <button @click="handleInterrupt" :disabled="avatarStatus !== 'connected'"
            class="text-[8px] px-2 py-0.5 rounded-md transition-all cursor-pointer disabled:opacity-30"
            style="color: var(--ruby-400); background: rgba(158, 42, 90, 0.15); border: 1px solid rgba(158, 42, 90, 0.2)">
            打断播报
          </button>
        </div>
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-[9px] font-medium" style="color: var(--text-muted)">
              <Volume1 class="w-3 h-3" style="color: var(--text-dim)" />
              音量 {{ aiVolume }}%
            </span>
            <button @click="toggleMute" class="text-[8px] cursor-pointer bg-transparent border-none" style="color: var(--gold-400)">
              {{ isVirtualMuted ? '取消静音' : '静音' }}
            </button>
          </div>
          <input type="range" min="0" max="100" :value="aiVolume" @input="handleVolumeChange"
            class="w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500" style="background: rgba(59, 130, 246, 0.1)" />
        </div>
        <div class="flex items-center justify-between pt-1" style="border-top: 1px solid var(--border-card)">
          <div class="flex items-center gap-1.5">
            <input type="checkbox" v-model="syncToMainChat" id="sync-chat" class="h-2.5 w-2.5 rounded accent-blue-500 cursor-pointer" />
            <label for="sync-chat" class="text-[9px] cursor-pointer select-none" style="color: var(--text-muted)">聊天区同步</label>
          </div>
          <button @click="avatarResize()" :disabled="avatarStatus !== 'connected'"
            class="text-[8px] cursor-pointer bg-transparent border-none disabled:opacity-30" style="color: var(--text-muted)">
            刷新画面
          </button>
        </div>
      </div>

      <!-- Card 4: 动作驱动 -->
      <div class="glass-card rounded-2xl p-3.5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between text-[10px] font-bold tracking-wider" style="color: var(--text-muted)">
          <span class="flex items-center gap-1.5">
            <PersonStanding class="w-3.5 h-3.5" style="color: var(--gold-400)" />
            动作驱动
          </span>
          <span class="text-[8px] font-mono" style="color: var(--text-dim)">ACTION</span>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          <button v-for="action in avatarActions" :key="action.id" @click="handleAction(action.id)" :disabled="avatarStatus !== 'connected'"
            class="py-2 rounded-lg text-[9px] font-medium transition-all cursor-pointer disabled:opacity-30 flex flex-col items-center gap-1"
            style="background: rgba(59, 130, 246, 0.06); border: 1px solid var(--border-card); color: var(--text-muted)">
            <span class="text-sm">{{ action.emoji }}</span>
            <span>{{ action.label }}</span>
          </button>
        </div>
      </div>

      <!-- Card 5: 连接管理 -->
      <div class="glass-card rounded-2xl p-3.5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between text-[10px] font-bold tracking-wider" style="color: var(--text-muted)">
          <span class="flex items-center gap-1.5">
            <Wifi class="w-3.5 h-3.5" :class="avatarStatus === 'connected' ? 'text-emerald-400' : ''" style="color: avatarStatus === 'connected' ? undefined : 'var(--text-muted)'" />
            连接管理
          </span>
          <span class="text-[8px] px-1.5 py-0.5 rounded-full border font-mono"
            :class="avatarStatus === 'connected' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : avatarStatus === 'loading' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse' : ''"
            :style="avatarStatus !== 'connected' && avatarStatus !== 'loading' ? { background: 'rgba(74, 70, 60, 0.15)', color: 'var(--text-muted)', borderColor: 'rgba(74, 70, 60, 0.3)' } : {}"
          >
            {{ avatarStatus === 'connected' ? 'LIVE' : avatarStatus === 'loading' ? 'CONNECTING' : avatarStatus === 'error' ? 'ERROR' : 'STANDBY' }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button @click="avatarStatus === 'connected' ? handleDisconnect() : startAvatar()" :disabled="avatarStatus === 'loading'"
            class="py-2 rounded-xl text-[10px] font-bold text-white transition-all cursor-pointer border-none flex items-center justify-center gap-1 disabled:opacity-30"
            :class="avatarStatus === 'connected' ? 'bg-rose-600/80 hover:bg-rose-500' : ''"
            :style="avatarStatus !== 'connected' ? { background: 'linear-gradient(135deg, var(--gold-500), var(--gold-600))' } : {}"
          >
            {{ avatarStatus === 'connected' ? '断开连接' : '启动虚拟人' }}
          </button>
          <button @click="handleViewReport"
            class="py-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
            style="color: var(--gold-400); background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2)">
            查看报告
          </button>
        </div>
        <div v-if="avatarError" class="text-[9px] rounded-lg px-2.5 py-1.5" style="color: var(--ruby-400); background: rgba(158, 42, 90, 0.15); border: 1px solid rgba(158, 42, 90, 0.2)">
          {{ avatarError }}
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { Tv, X, Mic, MessageSquare, Volume1, SlidersHorizontal, PersonStanding, AudioLines, Wifi } from 'lucide-vue-next'
import {
  isAiSidebarOpen, isVirtualMuted, isAiSpeaking,
  aiSubtitle, aiVolume, syncToMainChat,
  canUnlockReport, activeMenu, showReport, chats,
  textInput, useNlp,
} from '@/composables/dialogue/useAppState'
import { handleQuickSandboxDeduce } from '@/composables/dialogue/useAppState'
import {
  avatarStatus, avatarSubtitle, avatarError, playNotAllowed, isRecording,
  initAvatar, avatarWriteText, avatarInterrupt, avatarDestroy, avatarResume,
  avatarStop, setAvatarVolume, setAvatarMuted, avatarStartRecord, avatarStopRecord,
  avatarWriteCmd, avatarResize,
} from '@/composables/dialogue/useAvatarSdk'

defineProps<{ side: 'left' | 'right' }>()

const avatarStageRef = ref<HTMLDivElement | null>(null)
const avatarContainerRef = ref<HTMLDivElement | null>(null)
const avatarWrapperRef = ref<HTMLDivElement | null>(null)

const quickTexts = [
  { label: '自我介绍', text: '你好，请做个自我介绍' },
  { label: '学习规划', text: '我该如何科学地规划自己的日常AI学习道路呢？' },
  { label: '大模型算法', text: '目前大模型开发需要精通哪些算法模型和工程技巧？' },
  { label: '零基础起步', text: '零基础跨界，如何系统性地实践第一个AI项目？' },
]

const avatarActions = [
  { id: 'A_Hello_l_F', label: '打招呼', emoji: '👋' },
  { id: 'A_Nod_l_F', label: '点头', emoji: '👍' },
  { id: 'A_Wave_l_F', label: '挥手', emoji: '🤚' },
  { id: 'A_Think_l_F', label: '思考', emoji: '🤔' },
  { id: 'A_Clap_l_F', label: '鼓掌', emoji: '👏' },
  { id: 'A_Bow_l_F', label: '鞠躬', emoji: '🙇' },
]

// ---- Derived status ----
const statusIconClass = computed(() => {
  if (avatarStatus.value === 'loading') return 'text-blue-400 animate-pulse'
  if (avatarStatus.value === 'connected') return 'text-emerald-400'
  if (avatarStatus.value === 'error') return 'text-rose-400'
  return 'animate-pulse' // default blue
})

const statusBadgeClass = computed(() => {
  if (avatarStatus.value === 'loading') return 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse'
  if (avatarStatus.value === 'connected') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  if (avatarStatus.value === 'error') return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
  return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
})

const statusText = computed(() => {
  if (avatarStatus.value === 'loading') return 'CONNECTING'
  if (avatarStatus.value === 'connected') return 'LIVE'
  if (avatarStatus.value === 'error') return 'ERROR'
  return 'STANDBY'
})

const currentSubtitle = computed(() => {
  if (avatarStatus.value === 'connected' && avatarSubtitle.value) return avatarSubtitle.value
  return aiSubtitle.value
})

// ---- Avatar lifecycle ----
async function startAvatar() {
  if (!avatarWrapperRef.value) return
  await initAvatar(avatarWrapperRef.value)
}

function handleStageClick() {
  if (avatarStatus.value === 'idle' || avatarStatus.value === 'error') startAvatar()
}

function handleResume() { avatarResume() }

function handleSendText() {
  const text = textInput.value.trim()
  if (!text || avatarStatus.value !== 'connected') return
  avatarWriteText(text, useNlp.value)
  isAiSpeaking.value = true
  if (syncToMainChat.value) {
    const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    chats.value = [...chats.value, { id: `ai-user-${Date.now()}`, sender: 'user', text, time: currentTime, source: 'ai' }]
  }
  textInput.value = ''
}

function handleFullDuplex() {
  if (avatarStatus.value !== 'connected') return
  if (isRecording.value) avatarStopRecord()
  else avatarStartRecord(0)
}

function handleShortVoice() {
  if (avatarStatus.value !== 'connected') return
  avatarStartRecord(10 * 1000)
}

function handleInterrupt() { avatarInterrupt(); isAiSpeaking.value = false }
function handleAction(actionId: string) { avatarWriteCmd(actionId) }
function handleDisconnect() { avatarStop() }

function toggleMute() {
  isVirtualMuted.value = !isVirtualMuted.value
  setAvatarMuted(isVirtualMuted.value)
}

function handleVolumeChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  aiVolume.value = v
  setAvatarVolume(v)
}

function handleViewReport() {
  if (canUnlockReport.value) { activeMenu.value = 'portrait-report'; showReport.value = true }
  else handleQuickSandboxDeduce()
}

// 收起仅隐藏不卸载，需主动断开以释放并发路数与计时配额
watch(isAiSidebarOpen, (open) => { if (!open) avatarStop() })

onUnmounted(() => { avatarDestroy() })
</script>
