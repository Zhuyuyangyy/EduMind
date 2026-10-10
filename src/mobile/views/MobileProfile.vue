<template>
  <section class="profile">
    <h1 class="m-section-title">我的</h1>

    <!-- 账号（真实会话） -->
    <div class="m-card profile__account">
      <div class="profile__avatar">{{ (session?.account || '?').slice(0, 1).toUpperCase() }}</div>
      <div class="profile__account-body">
        <p class="profile__name">{{ session?.name || session?.account || '未登录' }}</p>
        <p class="profile__meta">
          {{ session?.account || '—' }} · {{ session?.role === 'admin' ? '管理员' : '学习者' }}
        </p>
      </div>
    </div>

    <!-- 服务连接诊断（真实接口） -->
    <h2 class="m-section-title">服务连接诊断</h2>
    <div class="m-card">
      <div class="m-row"><span>健康检查</span><span class="m-row__value" :class="health.ok ? 'ok' : 'err'">{{ health.ok ? '正常' : health.text }}</span></div>
      <div class="m-row"><span>模型服务</span><span class="m-row__value" :class="llm.configured ? 'ok' : 'warn'">{{ llm.configured ? `${llm.provider} · ${llm.model}` : '未配置（规则降级）' }}</span></div>
      <div class="m-row"><span>存储后端</span><span class="m-row__value">{{ health.storageBackend || '—' }}</span></div>
      <div class="m-row"><span>最近一次追踪</span><span class="m-row__value" :class="latestTrace.fallbackUsed ? 'warn' : 'ok'">{{ latestTrace.text }}</span></div>
      <button class="m-btn m-btn--ghost m-btn--sm" :disabled="checking" @click="runChecks">{{ checking ? '检测中…' : '重新检测' }}</button>
    </div>

    <!-- API 地址（真实配置，P1.5 校验） -->
    <h2 class="m-section-title">API 地址</h2>
    <div class="m-card">
      <p class="profile__hint">
        当前：<b>{{ effectiveBase || '未配置（相对路径，仅网页版可用）' }}</b><br />
        正式版本只允许 HTTPS 地址；开发版本仅限本机 HTTP。
      </p>
      <input v-model="baseInput" class="m-input" type="url" placeholder="https://yx.shushubiye.fun" inputmode="url" />
      <div class="profile__actions">
        <button class="m-btn m-btn--primary m-btn--sm" :disabled="savingBase" @click="onSaveBase">{{ savingBase ? '保存中…' : '保存并重连' }}</button>
        <button class="m-btn m-btn--ghost m-btn--sm" @click="onResetBase">恢复默认</button>
      </div>
      <p v-if="baseMsg" class="profile__msg" :class="baseOk ? 'ok' : 'err'">{{ baseMsg }}</p>
    </div>

    <!-- 学习偏好（本地占位，P2-3 接账号级持久化） -->
    <h2 class="m-section-title">学习偏好 <span class="m-section-title__sub">示例数据</span></h2>
    <div class="m-card">
      <div class="m-row"><span>每日学习目标</span><span class="m-row__value">15 分钟</span></div>
      <div class="m-row"><span>讲解风格</span><span class="m-row__value">启发式引导</span></div>
      <div class="m-row"><span>难度自适应</span><span class="m-row__value">开</span></div>
      <p class="profile__hint">偏好设置当前为本地示例，P2-3 起与服务端账号设置同步。</p>
    </div>

    <!-- 帮助与关于 -->
    <h2 class="m-section-title">帮助与关于</h2>
    <div class="m-card">
      <div class="m-row"><span>版本</span><span class="m-row__value">Mobile P2-1</span></div>
      <div class="m-row"><span>会话有效期</span><span class="m-row__value">7 天（服务端签发）</span></div>
      <div class="m-row"><span>数据隔离</span><span class="m-row__value">按账号隔离</span></div>
    </div>

    <button v-if="session" class="m-btn m-btn--danger m-btn--block profile__logout" @click="onLogout">退出登录</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { clearAuthSession, getAuthSession } from '@/lib/auth'
import { fetchCurrentSession, logout, apiGet } from '@/lib/api'
import { getApiBase, getDefaultApiBase, setApiBase, validateApiBase } from '@/lib/api-config'
import { bumpDataEpoch } from '@/mobile/data/learning-data'
import { resetStudyLocalState } from '@/mobile/data/study'

const router = useRouter()
const session = ref(getAuthSession())
const baseInput = ref(getApiBase())
const savingBase = ref(false)
const baseMsg = ref('')
const baseOk = ref(true)
const checking = ref(false)

const health = ref<{ ok: boolean; text: string; storageBackend?: string }>({ ok: false, text: '未检测' })
const llm = ref<{ configured: boolean; provider?: string; model?: string }>({ configured: false })
const latestTrace = ref<{ fallbackUsed: boolean; text: string }>({ fallbackUsed: false, text: '未检测' })

onMounted(async () => {
  document.title = '我的 · 智学星枢 Mobile'
  // 用服务端会话刷新本地账号信息
  try {
    const fresh = await fetchCurrentSession()
    session.value = { role: fresh.role, name: fresh.displayName, account: fresh.account, loginAt: new Date().toISOString() }
  } catch {
    session.value = getAuthSession()
  }
  await runChecks()
})

const effectiveBase = getApiBase()

async function runChecks() {
  checking.value = true
  health.value = { ok: false, text: '检测中…' }
  // 全部经共享 API 客户端（自动携带 Bearer + 401 统一处理）
  try {
    const data = await apiGet<{ ok: boolean; storageBackend?: string }>('/api/health')
    health.value = { ok: true, text: '正常', storageBackend: data.storageBackend }
  } catch {
    health.value = { ok: false, text: '不可达' }
  }

  try {
    llm.value = await apiGet<{ configured: boolean; provider?: string; model?: string }>('/api/llm/status')
  } catch {
    llm.value = { configured: false }
  }

  try {
    const data = await apiGet<{ items?: Array<{ fallbackUsed?: boolean }> }>('/api/evidence/traces?limit=1')
    const latest = data.items?.[0]
    latestTrace.value = latest
      ? { fallbackUsed: Boolean(latest.fallbackUsed), text: latest.fallbackUsed ? '降级生成' : '模型生成' }
      : { fallbackUsed: false, text: '暂无记录' }
  } catch (err) {
    latestTrace.value = { fallbackUsed: false, text: err instanceof Error && /401/.test(err.message) ? '登录已过期' : '不可达' }
  }
  checking.value = false
}

async function onSaveBase() {
  savingBase.value = true
  baseMsg.value = ''
  try {
    const value = baseInput.value.trim()
    // 统一走共享校验（正式构建仅 HTTPS 可信地址，开发例外仅限 localhost）
    const check = validateApiBase(value)
    if (!check.ok) throw new Error(check.error)
    setApiBase(value)
    baseOk.value = true
    baseMsg.value = '已保存，正在重新检测…'
    // API 地址变化：数据纪元 +1，各页下次进入时按新地址重新拉取
    bumpDataEpoch()
    await runChecks()
    baseMsg.value = health.value.ok ? '已保存，服务连接正常' : '已保存，但服务不可达，请检查地址'
    baseOk.value = health.value.ok
  } catch (err) {
    baseOk.value = false
    baseMsg.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    savingBase.value = false
  }
}

function onResetBase() {
  baseInput.value = getDefaultApiBase()
  setApiBase('')
  baseOk.value = true
  baseMsg.value = '已恢复默认（构建时配置）'
}

async function onLogout() {
  try {
    await logout()
  } finally {
    clearAuthSession()
    // 退出即失效纪元：在途响应全部丢弃，下一账号从干净状态开始
    resetStudyLocalState()
    await router.replace('/login')
  }
}
</script>

<style scoped>
.profile__account {
  display: flex;
  align-items: center;
  gap: var(--m-space-4);
}

.profile__avatar {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: var(--m-radius-full);
  background: var(--m-gradient-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--m-text-xl);
  font-weight: 700;
  color: #04121f;
}

.profile__account-body {
  min-width: 0;
}

.profile__name {
  font-size: var(--m-text-lg);
  font-weight: 700;
  margin: 0 0 2px;
}

.profile__meta {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: 0;
}

.profile__hint {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  line-height: 1.8;
  margin: 0 0 var(--m-space-3);
}
.profile__hint b {
  color: var(--m-text-dim);
  word-break: break-all;
}

.profile__actions {
  display: flex;
  gap: var(--m-space-2);
  margin-top: var(--m-space-3);
}

.profile__msg {
  font-size: var(--m-text-sm);
  margin: var(--m-space-2) 0 0;
}
.profile__msg.ok {
  color: var(--m-success);
}
.profile__msg.err {
  color: var(--m-danger);
}

.profile__logout {
  margin-top: var(--m-space-6);
}

/* 与 token 同级的语义色（组件类在 tokens.css，这里补 scoped 引用） */
.ok {
  color: var(--m-success);
}
.warn {
  color: var(--m-warn);
}
.err {
  color: var(--m-danger);
}
</style>
