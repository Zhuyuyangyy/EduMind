<template>
  <section class="status">
    <h1 class="title">状态与设置</h1>

    <div class="card">
      <h2 class="card-title">当前账号</h2>
      <p v-if="session" class="row"><span>账号</span><b>{{ session.account }}</b></p>
      <p v-if="session" class="row"><span>角色</span><b>{{ session.role === 'admin' ? '管理员' : '学习者' }}</b></p>
      <p v-else class="row"><span>状态</span><b>未登录</b></p>
    </div>

    <div class="card">
      <h2 class="card-title">API 地址</h2>
      <p class="hint">
        移动端必须使用绝对地址。当前：<b>{{ effectiveBase || '未配置（相对路径，仅网页版可用）' }}</b>
      </p>
      <input v-model="baseInput" class="base-input" type="url" placeholder="https://yx.shushubiye.fun" inputmode="url" />
      <div class="actions">
        <button class="btn" :disabled="savingBase" @click="onSaveBase">{{ savingBase ? '保存中…' : '保存并重连' }}</button>
        <button class="btn btn-ghost" @click="onResetBase">恢复默认</button>
      </div>
      <p v-if="baseMsg" class="msg" :class="baseOk ? 'ok' : 'err'">{{ baseMsg }}</p>
    </div>

    <div class="card">
      <h2 class="card-title">服务状态</h2>
      <p class="row"><span>健康检查</span><b :class="health.ok ? 'ok' : 'err'">{{ health.ok ? '正常' : health.text }}</b></p>
      <p class="row"><span>模型服务</span><b :class="llm.configured ? 'ok' : 'warn'">{{ llm.configured ? `${llm.provider} · ${llm.model}` : '未配置（走规则降级）' }}</b></p>
      <p class="row"><span>存储后端</span><b>{{ health.storageBackend || '—' }}</b></p>
      <p class="row">
        <span>最近一次追踪</span>
        <b :class="latestTrace.fallbackUsed ? 'warn' : 'ok'">
          {{ latestTrace.text }}
        </b>
      </p>
      <button class="btn btn-ghost" :disabled="checking" @click="runChecks">{{ checking ? '检测中…' : '重新检测' }}</button>
    </div>

    <button v-if="session" class="logout" @click="onLogout">退出登录</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { clearAuthSession, getAuthSession } from '@/lib/auth'
import { fetchCurrentSession, logout } from '@/lib/api'
import { getApiBase, getDefaultApiBase, setApiBase } from '@/lib/api-config'

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
  document.title = '状态 · 智学星枢 Mobile'
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
  try {
    const res = await fetch(`${getApiBase()}/api/health`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      health.value = { ok: true, text: '正常', storageBackend: data.storageBackend }
    } else {
      health.value = { ok: false, text: `HTTP ${res.status}` }
    }
  } catch {
    health.value = { ok: false, text: '不可达' }
  }

  try {
    const res = await fetch(`${getApiBase()}/api/llm/status`)
    llm.value = res.ok ? await res.json() : { configured: false }
  } catch {
    llm.value = { configured: false }
  }

  try {
    const res = await fetch(`${getApiBase()}/api/evidence/traces?limit=1`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      const latest = data.items?.[0]
      latestTrace.value = latest
        ? { fallbackUsed: Boolean(latest.fallbackUsed), text: latest.fallbackUsed ? '降级生成' : '模型生成' }
        : { fallbackUsed: false, text: '暂无记录' }
    } else {
      latestTrace.value = { fallbackUsed: false, text: `HTTP ${res.status}` }
    }
  } catch {
    latestTrace.value = { fallbackUsed: false, text: '不可达' }
  }
  checking.value = false
}

async function onSaveBase() {
  savingBase.value = true
  baseMsg.value = ''
  try {
    const value = baseInput.value.trim()
    if (value && !/^https?:\/\//.test(value)) {
      throw new Error('地址必须以 http:// 或 https:// 开头')
    }
    setApiBase(value)
    baseOk.value = true
    baseMsg.value = '已保存，正在重新检测…'
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
    await router.replace('/login')
  }
}
</script>

<style scoped>
.title {
  font-size: 21px;
  margin: 4px 0 16px;
}

.card {
  background: #0e2033;
  border: 1px solid #285275;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.card-title {
  font-size: 14px;
  color: #54d6ff;
  margin: 0 0 10px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  margin: 8px 0;
  color: #9eb6ca;
}

.row b {
  color: #e9f4ff;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.ok {
  color: #72f0bd !important;
}

.warn {
  color: #ffc857 !important;
}

.err {
  color: #ff9ca8 !important;
}

.hint {
  font-size: 12px;
  color: #6f8ba6;
  line-height: 1.7;
  margin: 0 0 10px;
}

.hint b {
  color: #cddce8;
  word-break: break-all;
}

.base-input {
  width: 100%;
  background: #07111f;
  border: 1px solid #285275;
  border-radius: 10px;
  padding: 11px 12px;
  font-size: 14px;
  color: #e9f4ff;
  outline: none;
}

.base-input:focus {
  border-color: #54d6ff;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.btn {
  background: #1f6feb;
  border: none;
  border-radius: 10px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
}

.btn-ghost {
  background: transparent;
  border: 1px solid #285275;
  color: #9eb6ca;
}

.msg {
  font-size: 12px;
  margin: 10px 0 0;
}

.logout {
  width: 100%;
  background: #3a1620;
  border: 1px solid #6b2233;
  color: #ff9ca8;
  border-radius: 12px;
  padding: 13px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}
</style>
