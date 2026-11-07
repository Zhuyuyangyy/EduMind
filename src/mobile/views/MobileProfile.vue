<template>
  <section class="profile">
    <div class="profile__heading"><h1>我的</h1><span>按自己的节奏，慢慢积累。</span></div>

    <!-- 账号（真实会话） -->
    <div class="profile__account">
      <div class="profile__avatar">{{ (session?.name || session?.account || '?').slice(0, 1).toUpperCase() }}</div>
      <div class="profile__account-body">
        <p class="profile__name">{{ session?.name || session?.account || '未登录' }}</p>
        <p class="profile__meta">
          {{ session?.role === 'admin' ? '管理员' : '学习者' }} · {{ session?.account || '—' }}
        </p>
        <RouterLink to="/workspace" class="profile__current-goal" :class="{ 'profile__current-goal--set': learning.workspace?.goals.some(g=>g.status==='active') }"><MobileIcon name="target" :size="13" /><span><b>{{ learning.workspace?.goals.find(g=>g.status==='active')?.title || '设置一个学习目标' }}</b><small>{{ learning.workspace?.goals.some(g=>g.status==='active') ? '当前学习目标 · 影响首页与今日任务' : '设置后，首页会为你安排今天的第一步' }}</small></span></RouterLink>
        <RouterLink to="/login?register=1" class="profile__account-switch">创建新账号 / 切换账号</RouterLink>
      </div>
    </div>

    <ProfileLearningSummary />
    <h2 class="profile__group-label">学习</h2>
    <div class="m-card profile__links">
      <RouterLink to="/workspace"><span><MobileIcon name="target" /> 目标与学习时间</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
      <RouterLink to="/growth"><span><MobileIcon name="chart" /> 学习记录与画像报告</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
      <RouterLink to="/planning"><span><MobileIcon name="path" /> 调整学习计划</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
    </div>
    <h2 class="profile__group-label profile__group-label--spaced">偏好与账号</h2>
    <div class="m-card profile__links">
      <RouterLink :to="{ path: '/workspace', query: { tab: 'memory' } }"><span><MobileIcon name="sparkle" /> 记忆与个性化</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
      <RouterLink :to="{ path: '/workspace', query: { tab: 'reminders' } }"><span><MobileIcon name="clock" /> 复习提醒</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
      <RouterLink :to="{ path: '/workspace', query: { tab: 'privacy' } }"><span><MobileIcon name="settings" /> 数据、导出与反馈</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
      <button class="profile__welcome-entry" @click="requestWelcomeCards"><span><MobileIcon name="sparkle" /> 重新认识我</span><MobileIcon name="chevronRight" :size="17" /></button>
      <RouterLink to="/diagnose"><span><MobileIcon name="diagnose" /> 学习档案与偏好</span><MobileIcon name="chevronRight" :size="17" /></RouterLink>
    </div>
    <h2 class="profile__group-label profile__group-label--spaced">系统</h2>
    <details id="profile-name-edit" class="profile__edit m-card">
      <summary><span><MobileIcon name="profile" :size="18" /> 编辑昵称</span><MobileIcon name="chevronRight" :size="16" /></summary>
    <form class="profile__name-form" @submit.prevent="saveName">
      <label class="m-field"><span>昵称</span><input v-model="displayName" class="m-input" maxlength="60" required placeholder="你希望怎样被称呼" /></label>
      <button class="m-btn m-btn--ghost m-btn--sm" type="submit" :disabled="savingName">{{ savingName ? '保存中…' : '保存昵称' }}</button>
      <p v-if="nameMessage" role="status" class="profile__hint">{{ nameMessage }}</p>
    </form>
    </details>
    <details class="profile__diagnostics">
      <summary><MobileIcon name="settings" :size="18" /> 服务连接与高级设置</summary>
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
      <label class="m-field"><span>服务地址</span><input v-model="baseInput" class="m-input" type="url" placeholder="https://yx.shushubiye.fun" inputmode="url" /></label>
      <div class="profile__actions">
        <button class="m-btn m-btn--primary m-btn--sm" :disabled="savingBase" @click="onSaveBase()">{{ savingBase ? '保存中…' : '保存并重连' }}</button>
        <button class="m-btn m-btn--ghost m-btn--sm" @click="onResetBase">恢复默认</button>
      </div>
      <p v-if="baseMsg" class="profile__msg" :class="baseOk ? 'ok' : 'err'">{{ baseMsg }}</p>
    </div>

    </details>
    <!-- 帮助与关于 -->
    <details class="profile__about"><summary>关于智学星枢<span>1.0</span></summary>
    <div class="m-card">
      <div class="m-row"><span>版本</span><span class="m-row__value">1.0 · 学习空间</span></div>
      <div class="m-row"><span>学习档案</span><span class="m-row__value">随账号保存</span></div>
      <div class="m-row"><span>数据隔离</span><span class="m-row__value">按账号隔离</span></div>
    </div>

    </details>
    <button v-if="session" class="m-btn m-btn--danger m-btn--block profile__logout" @click="onLogout">退出登录</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { clearAuthSession, getAuthSession, setAuthSession, prepareOriginSwitch } from '@/lib/auth'
import { fetchCurrentSession, logout, apiGet, saveAccountSettings } from '@/lib/api'
import { getApiBase, getDefaultApiBase, setApiBase, validateApiBase } from '@/lib/api-config'
import { bumpDataEpoch } from '@/mobile/data/learning-data'
import { resetStudyLocalState } from '@/mobile/data/study'
import { useLearningWorkspace } from '@/mobile/stores/learning-workspace'
import ProfileLearningSummary from '@/mobile/components/ProfileLearningSummary.vue'
import MobileIcon from '../components/MobileIcon.vue'
import { requestWelcomeCards } from '@/mobile/data/welcome'

const router = useRouter(), learning = useLearningWorkspace()
const session = ref(getAuthSession())
const displayName = ref(session.value?.name || '')
const savingName = ref(false)
const nameMessage = ref('')
async function saveName() {
  if (!displayName.value.trim()) return
  savingName.value = true
  nameMessage.value = ''
  try {
    const saved = await saveAccountSettings(displayName.value.trim())
    displayName.value = saved.displayName
    if (session.value) {
      session.value = { ...session.value, name: saved.displayName }
      setAuthSession(session.value)
    }
    nameMessage.value = '昵称已保存，下次登录后仍会保留。'
  } catch { nameMessage.value = '保存失败，请检查连接后重试。' }
  finally { savingName.value = false }
}
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
  displayName.value = session.value?.name || session.value?.account || ''
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

async function onSaveBase(explicitValue?: string) {
  savingBase.value = true
  baseMsg.value = ''
  try {
    const value = explicitValue !== undefined ? explicitValue.trim() : baseInput.value.trim()
    // 统一走共享校验（正式构建仅可信白名单 HTTPS，开发例外仅限 localhost）
    const check = validateApiBase(value)
    if (!check.ok) throw new Error(check.error)
    // P4-2A：直接比较切换前后的 API origin（与存储位置无关）。
    // origin 变更先尽力撤销旧服务会话，再解除本地绑定、中继在途请求，
    // 旧 token 绝不发往新服务；恢复默认地址同样遵守该规则。
    const switchResult = await prepareOriginSwitch(value)
    if (switchResult.conflict) {
      resetStudyLocalState()
      baseMsg.value = switchResult.revoked
        ? 'API 地址已切换，旧服务会话已撤销，请重新登录。'
        : 'API 地址已切换，登录状态已解除，请重新登录。'
      setApiBase(value)
      baseOk.value = true
      bumpDataEpoch()
      setTimeout(() => {
        window.location.assign('#/login')
      }, 800)
      return
    }
    setApiBase(value)
    baseOk.value = true
    baseMsg.value = explicitValue !== undefined ? '已恢复默认，正在重新检测…' : '已保存，正在重新检测…'
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

/**
 * 恢复默认 API 地址（P4-2B-0）。
 * 与「保存并重连」收敛到同一个异步切换入口 onSaveBase('')——
 * 恢复默认同样可能发生 origin 变更（B → 默认 A），必须走撤销 /
 * 解绑 / 中止在途的完整流程，不能绕过。
 */
async function onResetBase() {
  baseInput.value = getDefaultApiBase()
  await onSaveBase('')
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
.profile__welcome-entry { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; min-height: 62px; border: 0; border-bottom: 1px solid var(--m-border); padding: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 14px; cursor: pointer; }
.profile__welcome-entry > span { display: flex; align-items: center; gap: 12px; }
.profile__edit { margin-top: 16px; padding: 0 20px; }
.profile__edit summary { display: flex; align-items: center; justify-content: space-between; min-height: 60px; cursor: pointer; font-size: 14px; }
.profile__edit summary span { display: flex; gap: 12px; align-items: center; }
.profile__edit summary .m-icon { color: var(--m-primary); }
.profile__edit[open] summary > .m-icon { transform: rotate(90deg); }
.profile__edit .profile__name-form { margin-top: 0; padding-bottom: 20px; }
.profile__heading { margin: 8px 0 24px; }
.profile__heading p { margin: 0 0 6px; font-size: 13px; color: var(--m-text-faint); }
.profile__heading h1 { margin: 0; font-size: var(--m-text-2xl); letter-spacing: -1px; }
.profile__account { margin-bottom: 22px; padding: 26px 22px; background: var(--m-surface); border: 1px solid var(--m-primary-border); }
.profile__links { padding: 4px 20px; }
.profile__links a { display: flex; align-items: center; justify-content: space-between; min-height: 62px; color: var(--m-text); text-decoration: none; font-size: 14px; border-bottom: 1px solid var(--m-border); gap: 12px; }
.profile__links a:last-child { border: 0; }
.profile__links a span { display: flex; align-items: center; gap: 12px; }
.profile__links .m-icon { color: var(--m-primary); }
.profile__name-form { margin-top: 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.profile__name-form label { width: 100%; }
.profile__diagnostics { margin-top: 24px; }
.profile__diagnostics summary { display: flex; align-items: center; gap: 10px; min-height: 56px; cursor: pointer; color: var(--m-text-dim); font-size: 14px; }
.profile__diagnostics summary::after { content: '+'; margin-left: auto; font-size: 20px; }
.profile__diagnostics[open] summary::after { content: '−'; }

.profile__account {
  display: flex;
  align-items: center;
  gap: var(--m-space-4);
}
.profile__current-goal { display:flex; align-items:flex-start; gap:7px; margin-top:9px; padding:9px 10px; border:1px solid var(--m-primary-border); border-radius:12px; background:var(--m-primary-soft); color:var(--m-primary); text-decoration:none; line-height:1.45; }
.profile__current-goal > .m-icon { margin-top:2px; flex:none; }
.profile__current-goal > span { min-width:0; }
.profile__current-goal b { display:block; font-size:12px; font-weight:600; overflow-wrap:anywhere; }
.profile__current-goal small { display:block; margin-top:2px; color:var(--m-text-faint); font-size:11px; }
.profile__current-goal:not(.profile__current-goal--set) { background:var(--m-surface); border-style:dashed; color:var(--m-text-dim); }
.profile__group-label--spaced { margin-top:24px; }
.profile__links + .profile__group-label { margin-top:24px; }

.profile__avatar {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 19px;
  background: var(--m-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--m-text-xl);
  font-weight: 700;
  color: var(--m-primary);
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

.profile__account-switch {
  display: inline-flex;
  margin-top: 10px;
  color: var(--m-primary);
  font-size: 12px;
  text-decoration: none;
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
