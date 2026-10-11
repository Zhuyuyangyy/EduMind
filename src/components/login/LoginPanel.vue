<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { completeLogin } from '@/lib/auth'
import { loginDemoAccount } from '@/lib/api'

type LoginRole = 'student' | 'admin'

const router = useRouter()
const loading = ref(false)
const activeRole = ref<LoginRole>('student')
const account = ref('')
const password = ref('')
const remember = ref(true)
const showPassword = ref(false)

const showRegister = ref(false)
const regAccount = ref('')
const regName = ref('')
const regPassword = ref('')
const regConfirm = ref('')

const roleConfigs = {
  student: {
    label: '学习者登录',
    sublabel: '用户',
    placeholderAccount: '请输入学号/账号',
    placeholderPassword: '请输入密码',
    buttonText: '进入学习平台',
    defaultAccount: 'reviewer',
    defaultPassword: 'Zhixue2026!',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
      <path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>`,
  },
  admin: {
    label: '管理员登录',
    sublabel: '后台管理',
    placeholderAccount: '请输入管理员账号',
    placeholderPassword: '请输入密码',
    buttonText: '进入管理后台',
    defaultAccount: '',
    defaultPassword: '',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>`,
  },
}

onMounted(() => {
  switchRole('student')
})

function switchRole(role: LoginRole) {
  activeRole.value = role
  account.value = roleConfigs[role].defaultAccount
  password.value = roleConfigs[role].defaultPassword
}

async function handleSubmit() {
  if (!account.value || !password.value) {
    alert('请输入账号密码')
    return
  }

  loading.value = true
  try {
    const result = await loginDemoAccount(account.value, password.value, activeRole.value)
    await completeLogin({
      role: result.role,
      name: result.displayName,
      account: result.account,
      loginAt: new Date().toISOString(),
    }, result.token)
    await router.push(result.role === 'admin' ? '/admin' : '/home')
  } catch (error) {
    alert(error instanceof Error ? error.message : '账号或密码错误')
  } finally {
    loading.value = false
  }
}

function handleRegister() {
  if (!regAccount.value || !regName.value || !regPassword.value) {
    alert('请填写完整注册信息')
    return
  }
  if (regPassword.value !== regConfirm.value) {
    alert('两次输入的密码不一致')
    return
  }
  alert(`注册成功！账号：${regAccount.value}，请返回登录`)
  showRegister.value = false
  regAccount.value = ''
  regName.value = ''
  regPassword.value = ''
  regConfirm.value = ''
}
</script>

<template>
    <aside class="login-panel" aria-label="智学星枢登录">
    <div class="panel-border-glow" aria-hidden="true"></div>
    <div class="panel-scan-line" aria-hidden="true"></div>

    <header class="panel-top-bar">
      <div class="top-brand">
        <div class="brand-logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M16 2L28 8V24L16 30L4 24V8L16 2Z" stroke="url(#logo-grad)" stroke-width="1.5" fill="url(#logo-fill)"/>
            <path d="M16 8L22 11V21L16 24L10 21V11L16 8Z" stroke="#00d4ff" stroke-width="1" fill="none"/>
            <circle cx="16" cy="16" r="3" fill="#00d4ff"/>
            <defs>
              <linearGradient id="logo-grad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                <stop stop-color="#00e5ff"/>
                <stop offset="1" stop-color="#0077ff"/>
              </linearGradient>
              <linearGradient id="logo-fill" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                <stop stop-color="rgba(0, 180, 255, 0.1)"/>
                <stop offset="1" stop-color="rgba(0, 100, 200, 0.05)"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="brand-texts">
          <span class="brand-cn">智学星枢</span>
          <span class="brand-en">ZHIXUE XINGSHU</span>
        </div>
        <span class="brand-divider" />
        <span class="ai-badge">
          <span class="ai-dot"></span>
          AI
        </span>
      </div>
      <div class="security-tag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        安全登录
      </div>
    </header>

    <div class="role-switcher">
      <button
        v-for="(config, role) in roleConfigs"
        :key="role"
        type="button"
        class="role-tab"
        :class="{ active: activeRole === role }"
        @click="switchRole(role as LoginRole)"
      >
        <span class="role-icon" v-html="config.icon" />
        <span class="role-text">
          <span class="role-label">{{ config.label }}</span>
          <span class="role-sublabel">{{ config.sublabel }}</span>
        </span>
      </button>
    </div>

    <header class="panel-header">
      <h1 class="panel-title">多智能体智慧学习平台</h1>
        <p class="panel-subtitle">—— 自适应学习路径决策与伴学 ——</p>
    </header>

    <form v-if="!showRegister" class="login-form" @submit.prevent="handleSubmit">
      <label class="input-field">
        <span class="input-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
        <input
          v-model="account"
          autocomplete="username"
          :placeholder="roleConfigs[activeRole].placeholderAccount"
        />
      </label>

      <label class="input-field">
        <span class="input-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </span>
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :placeholder="roleConfigs[activeRole].placeholderPassword"
        />
        <button type="button" class="input-eye" @click="showPassword = !showPassword" :aria-label="showPassword ? '隐藏密码' : '显示密码'">
          <svg v-if="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </button>
      </label>

      <div class="form-row">
        <label class="remember">
          <span class="checkbox-custom" :class="{ checked: remember }">
            <svg v-if="remember" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <input v-model="remember" type="checkbox" hidden />
          <span>记住我</span>
        </label>
        <button class="ghost-link" type="button">忘记密码？</button>
      </div>

      <button class="login-button" type="submit" :disabled="loading">
        <span class="btn-shine"></span>
        <span class="btn-text">
          {{ loading ? '登录中...' : roleConfigs[activeRole].buttonText }}
        </span>
      </button>

      <button v-if="activeRole === 'student'" type="button" class="register-link" @click="showRegister = true">
        还没有账号？<span>立即注册</span>
      </button>
    </form>

    <!-- 注册表单 -->
    <form v-if="showRegister" class="register-form" @submit.prevent="handleRegister">
      <div class="register-header">
        <h3>新用户注册</h3>
        <button type="button" class="back-login" @click="showRegister = false">返回登录</button>
      </div>
      <label class="input-field">
        <span class="input-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
        <input v-model="regName" placeholder="请输入姓名" />
      </label>
      <label class="input-field">
        <span class="input-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <path d="M2 10h20"/>
          </svg>
        </span>
        <input v-model="regAccount" placeholder="请输入学号/账号" />
      </label>
      <label class="input-field">
        <span class="input-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </span>
        <input v-model="regPassword" type="password" placeholder="请设置密码" />
      </label>
      <label class="input-field">
        <span class="input-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            <path d="m9 16 2 2 4-4"/>
          </svg>
        </span>
        <input v-model="regConfirm" type="password" placeholder="请确认密码" />
      </label>
      <button class="login-button" type="submit">
        <span class="btn-text">注册账号</span>
      </button>
    </form>

    <div class="panel-divider">
      <span class="divider-line"></span>
      <span class="divider-text">AI 核心能力预览</span>
      <span class="divider-line"></span>
    </div>

    <div class="features-grid" aria-label="AI 核心能力预览">
      <div class="feature-item">
        <div class="feature-icon-box">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="3"/>
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>
          </svg>
        </div>
        <div class="feature-text">
          <span class="feature-title">学习画像</span>
          <span class="feature-desc">精准刻画学习状态</span>
        </div>
      </div>
      <div class="feature-item">
        <div class="feature-icon-box">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="12" cy="18" r="3"/>
            <path d="M8.5 7.5l3.5 7.5M15.5 7.5l-3.5 7.5"/>
          </svg>
        </div>
        <div class="feature-text">
          <span class="feature-title">智能体协同</span>
          <span class="feature-desc">多智能体协同作业</span>
        </div>
      </div>
      <div class="feature-item">
        <div class="feature-icon-box">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 12h5M22 12h-5M12 2v5M12 22v-5"/>
            <circle cx="12" cy="12" r="4"/>
            <path d="M4.93 4.93l3.54 3.54M19.07 4.93l-3.54 3.54M4.93 19.07l3.54-3.54M19.07 19.07l-3.54-3.54"/>
          </svg>
        </div>
        <div class="feature-text">
          <span class="feature-title">反向评估</span>
          <span class="feature-desc">以评促学精准提升</span>
        </div>
      </div>
      <div class="feature-item">
        <div class="feature-icon-box">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="2"/>
            <ellipse cx="12" cy="12" rx="10" ry="4"/>
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/>
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-60 12 12)"/>
          </svg>
        </div>
        <div class="feature-text">
          <span class="feature-title">知识图谱</span>
          <span class="feature-desc">知识关联智能推荐</span>
        </div>
      </div>
    </div>

    <footer class="panel-stats">
      <div class="stat-block">
        <span class="stat-num">可追溯</span>
        <span class="stat-desc">学习数据</span>
        <span class="stat-sub">以真实运行记录为准</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-block">
        <span class="stat-num accent-cyan">实时</span>
        <span class="stat-desc">任务调度</span>
        <span class="stat-sub">多智能体高效协同</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-block">
        <span class="stat-num accent-emerald">可验证</span>
        <span class="stat-desc">运行状态</span>
        <span class="stat-sub">不展示无监测依据的指标</span>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.login-panel {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 24px;
  padding: 32px 32px;
  color: #e8f7ff;
  background: transparent;
  border: 1px solid rgba(0, 180, 255, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(100, 200, 255, 0.12),
    0 0 80px rgba(0, 100, 200, 0.18),
    0 0 0 1px rgba(255, 255, 255, 0.03);
  animation: panel-enter 800ms cubic-bezier(0.19, 1, 0.22, 1) both;
}

.panel-border-glow {
  position: absolute;
  inset: 0;
  border-radius: 24px;
  padding: 1px;
  background: linear-gradient(135deg,
    rgba(0, 200, 255, 0.3) 0%,
    rgba(0, 150, 255, 0.1) 30%,
    transparent 60%,
    rgba(0, 180, 255, 0.2) 100%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.panel-border-glow::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(100, 220, 255, 0.6), transparent);
}

.panel-scan-line {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(120deg, transparent 0 30%, rgba(0, 200, 255, 0.04), transparent 70% 100%);
  transform: translateX(-100%);
  animation: scan-move 7s ease-in-out infinite;
}

@keyframes scan-move {
  0%, 45% { transform: translateX(-100%); opacity: 0; }
  55% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
}

.role-switcher {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 24px;
  padding: 6px;
  border-radius: 14px;
  background: transparent;
  border: 1px solid rgba(0, 160, 255, 0.1);
}

.role-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: rgba(150, 200, 240, 0.7);
  cursor: pointer;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
}

.role-tab:hover {
  color: rgba(180, 220, 255, 0.9);
  background: rgba(0, 120, 200, 0.08);
}

.role-tab.active {
  color: #fff;
  background: linear-gradient(135deg, rgba(0, 120, 255, 0.25), rgba(0, 80, 180, 0.15));
  border-color: rgba(0, 180, 255, 0.35);
  box-shadow: 0 4px 20px rgba(0, 120, 255, 0.2), inset 0 1px 0 rgba(100, 200, 255, 0.2);
}

.role-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(0, 100, 200, 0.15);
  flex-shrink: 0;
  color: #00d4ff;
  transition: all 250ms ease;
}

.role-tab.active .role-icon {
  background: linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.2));
  box-shadow: 0 0 20px rgba(0, 180, 255, 0.25);
}

.role-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.role-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.role-sublabel {
  font-size: 10px;
  color: rgba(130, 180, 220, 0.6);
  letter-spacing: 0.05em;
}

.panel-header {
  position: relative;
  margin-bottom: 24px;
  text-align: center;
}

.panel-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0, 160, 255, 0.1);
}

.top-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  filter: drop-shadow(0 0 10px rgba(0, 200, 255, 0.4));
  animation: logo-pulse 3s ease-in-out infinite;
}

@keyframes logo-pulse {
  0%, 100% { filter: drop-shadow(0 0 10px rgba(0, 200, 255, 0.4)); }
  50% { filter: drop-shadow(0 0 18px rgba(0, 220, 255, 0.7)); }
}

.brand-texts {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1;
}

.brand-texts .brand-cn {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
}

.brand-texts .brand-en {
  font-size: 9px;
  color: rgba(100, 200, 255, 0.6);
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.top-brand .brand-divider {
  width: 1px;
  height: 28px;
  background: linear-gradient(180deg, transparent, rgba(0, 180, 255, 0.3), transparent);
  margin: 0 4px;
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, rgba(0, 100, 200, 0.6), rgba(0, 160, 255, 0.4));
  border: 1px solid rgba(0, 200, 255, 0.3);
  letter-spacing: 0.05em;
}

.ai-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #00ffcc;
  box-shadow: 0 0 6px rgba(0, 255, 200, 0.8);
  animation: dot-blink 2s ease-in-out infinite;
}

@keyframes dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.security-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  color: rgba(150, 220, 255, 0.7);
  background: transparent;
  border: 1px solid rgba(0, 160, 255, 0.12);
}

.panel-title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
  color: #fff;
  letter-spacing: 0.03em;
  text-shadow: 0 4px 30px rgba(0, 150, 255, 0.3), 0 2px 10px rgba(0, 0, 0, 0.3);
}

.panel-subtitle {
  margin: 10px 0 0;
  font-size: 13px;
  color: rgba(150, 210, 255, 0.6);
  letter-spacing: 0.08em;
}

.login-form {
  position: relative;
  display: grid;
  gap: 14px;
}

.input-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 50px;
  border: 1px solid rgba(0, 160, 255, 0.15);
  border-radius: 12px;
  padding: 0 16px;
  background: transparent;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.input-field:hover {
  border-color: rgba(0, 180, 255, 0.25);
  background: rgba(0, 150, 255, 0.04);
}

.input-field:focus-within {
  border-color: rgba(0, 200, 255, 0.45);
  background: rgba(0, 150, 255, 0.06);
  box-shadow:
    0 0 0 4px rgba(0, 150, 255, 0.08),
    inset 0 0 20px rgba(0, 120, 255, 0.05);
}

.input-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(100, 200, 255, 0.6);
  flex-shrink: 0;
  transition: color 200ms ease;
}

.input-field:focus-within .input-icon {
  color: rgba(0, 220, 255, 0.9);
}

.input-field input {
  flex: 1;
  height: 100%;
  border: none;
  padding: 0;
  color: #f5fbff;
  background: transparent;
  outline: none;
  font-size: 14px;
}

.input-field input::placeholder {
  color: rgba(148, 180, 210, 0.45);
}

.input-eye {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: rgba(148, 180, 210, 0.45);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 200ms ease;
}

.input-eye:hover {
  color: rgba(100, 200, 255, 0.8);
  background: rgba(0, 150, 255, 0.08);
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 2px 2px;
}

.remember {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: rgba(180, 220, 255, 0.75);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.checkbox-custom {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid rgba(0, 160, 255, 0.3);
  background: transparent;
  transition: all 200ms ease;
}

.checkbox-custom.checked {
  background: linear-gradient(135deg, #0088ff, #00aaff);
  border-color: #00aaff;
  color: #fff;
  box-shadow: 0 0 12px rgba(0, 150, 255, 0.4);
}

.ghost-link {
  border: 0;
  color: rgba(100, 200, 255, 0.75);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition: color 200ms ease;
}

.ghost-link:hover {
  color: #00d4ff;
}

.login-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #0066cc 0%, #0088ff 40%, #00aaff 100%);
  box-shadow:
    0 8px 32px rgba(0, 120, 255, 0.4),
    0 0 20px rgba(0, 150, 255, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: 4px;
}

.btn-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  transform: translateX(-120%);
  transition: transform 600ms cubic-bezier(0.19, 1, 0.22, 1);
}

.login-button:hover {
  transform: translateY(-2px);
  box-shadow:
    0 14px 44px rgba(0, 120, 255, 0.5),
    0 0 32px rgba(0, 150, 255, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.login-button:hover .btn-shine {
  transform: translateX(120%);
}

.login-button:active {
  transform: translateY(0);
}

.login-button:disabled {
  cursor: wait;
  opacity: 0.75;
  transform: none;
}

.register-link {
  display: block;
  width: 100%;
  padding: 10px 0 0;
  border: 0;
  background: none;
  color: rgba(180, 220, 255, 0.6);
  font-size: 13px;
  text-align: center;
  cursor: pointer;
  transition: color 200ms ease;
}

.register-link span {
  color: #00b4ff;
  font-weight: 600;
}

.register-link:hover span {
  color: #00d4ff;
  text-decoration: underline;
}

.register-form {
  display: grid;
  gap: 14px;
  animation: form-slide 300ms ease both;
}

.register-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.register-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.back-login {
  border: 0;
  background: none;
  color: #00b4ff;
  font-size: 12px;
  cursor: pointer;
  transition: color 200ms ease;
}

.back-login:hover {
  color: #00d4ff;
  text-decoration: underline;
}

@keyframes form-slide {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.btn-text {
  position: relative;
  z-index: 1;
}

.panel-divider {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 22px 0 18px;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 160, 255, 0.2), transparent);
}

.divider-text {
  font-size: 12px;
  font-weight: 600;
  color: rgba(150, 210, 255, 0.7);
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 250ms ease;
}

.feature-item:hover {
  background: rgba(0, 150, 255, 0.06);
  border-color: rgba(0, 160, 255, 0.15);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 100, 200, 0.1);
}

.feature-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #00d4ff;
  background: linear-gradient(135deg, rgba(0, 180, 255, 0.15), rgba(0, 120, 255, 0.08));
  border: 1px solid rgba(0, 200, 255, 0.15);
  flex-shrink: 0;
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.feature-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.feature-desc {
  font-size: 10px;
  color: rgba(150, 200, 240, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-stats {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 150, 255, 0.1);
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 3px;
}

.stat-num {
  font-size: 16px;
  font-weight: 700;
  color: #00d4ff;
  letter-spacing: 0.01em;
  text-shadow: 0 0 20px rgba(0, 200, 255, 0.4);
}

.stat-num.accent-cyan {
  color: #00d4ff;
}

.stat-num.accent-emerald {
  color: #34d399;
  text-shadow: 0 0 20px rgba(52, 211, 153, 0.4);
}

.stat-desc {
  font-size: 11px;
  font-weight: 600;
  color: rgba(200, 230, 255, 0.75);
}

.stat-sub {
  font-size: 9px;
  color: rgba(130, 180, 220, 0.4);
  letter-spacing: 0.02em;
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(180deg, transparent, rgba(0, 160, 255, 0.2), transparent);
}

@keyframes panel-enter {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.98);
    filter: blur(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes panel-breathe {
  0%, 100% {
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(100, 200, 255, 0.06),
      0 0 20px rgba(0, 100, 200, 0.06),
      0 0 0 1px rgba(255, 255, 255, 0.03);
    border-color: rgba(0, 180, 255, 0.12);
  }
  50% {
    box-shadow:
      0 10px 40px rgba(0, 0, 0, 0.35),
      inset 0 1px 0 rgba(100, 200, 255, 0.1),
      0 0 30px rgba(0, 140, 240, 0.1),
      0 0 0 1px rgba(255, 255, 255, 0.04);
    border-color: rgba(0, 210, 255, 0.2);
  }
}

@media (max-width: 500px) {
  .login-panel {
    padding: 24px 20px;
    border-radius: 20px;
  }

  .panel-title {
    font-size: 22px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .role-switcher {
    grid-template-columns: 1fr;
  }
}
</style>
