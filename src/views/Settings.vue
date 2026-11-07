<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  User,
  Palette,
  BookOpen,
  Shield,
  GitCompare,
  Sparkles,
  Sun,
  Moon,
  Bell,
  Volume2,
  Mail,
  Clock,
  Globe,
  Key,
  Link,
  Trash2,
  Download,
  Check,
  LogOut,
} from 'lucide-vue-next'
import { useAppStore } from '@/store'
import { getAuthSession, setAuthSession } from '@/lib/auth'
import { fetchAccountSettings, logout, saveAccountSettings } from '@/lib/api'

const router = useRouter()
const appStore = useAppStore()
const theme = ref('dark')
const language = ref('zh')
const notifications = ref(true)
const studyReminder = ref(true)
const reminderTime = ref('20:00')
const preferredResource = ref('video')
const emailDigest = ref(true)
const soundEnabled = ref(true)
const shareData = ref(false)
const accountEmail = ref('user@example.com')
const accountName = ref('学习者')
const saved = ref(false)
const authSession = getAuthSession()

if (authSession) {
  accountName.value = authSession.name || authSession.account
  accountEmail.value = `${authSession.account}@edumind.local`
}

onMounted(async () => {
  if (!authSession) return
  try {
    const settings = await fetchAccountSettings(authSession.account)
    if (settings?.displayName) {
      accountName.value = settings.displayName
      setAuthSession({ ...authSession, name: settings.displayName })
    }
  } catch {
    // The local session remains usable if settings cannot be loaded.
  }
})

async function saveSettings() {
  if (authSession) {
    const name = accountName.value.trim() || authSession.account
    try {
      const settings = await saveAccountSettings(name)
      accountName.value = settings.displayName
      setAuthSession({ ...authSession, name: settings.displayName })
    } catch {
      setAuthSession({ ...authSession, name })
    }
  }
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    void logout()
    window.location.href = '/login'
  }
}
</script>

<template>
  <div class="settings">
    <!-- Hero -->
    <div class="settings-hero">
      <div>
        <div class="hero-badge">设置</div>
        <h1 class="hero-title">个性化<span class="gradient-text">学习配置</span></h1>
        <p class="hero-desc">定制你的专属学习体验</p>
      </div>
    </div>

    <div class="settings-body">
      <!-- 1. Profile -->
      <section class="settings-group">
        <div class="group-header">
          <div class="group-icon profile-icon">
            <User :size="16" stroke-width="1.5" />
          </div>
          <h2 class="group-title">个人资料</h2>
        </div>
        <div class="group-card breathe-subtle">
          <!-- Avatar Row -->
          <div class="profile-row">
            <div class="avatar-section">
              <div class="avatar-ring">
                <span class="avatar-letter">学</span>
              </div>
              <button class="avatar-change">更换</button>
            </div>
            <div class="profile-details">
              <span class="profile-name">{{ accountName }}</span>
              <span class="profile-email">{{ accountEmail }}</span>
            </div>
          </div>

          <div class="field-row">
            <div class="field-info">
              <span class="field-label">用户名</span>
              <span class="field-desc">你的显示名称</span>
            </div>
            <input type="text" v-model="accountName" class="field-input" />
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">邮箱地址</span>
              <span class="field-desc">用于登录和接收通知</span>
            </div>
            <input type="email" v-model="accountEmail" class="field-input" />
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">登录密码</span>
              <span class="field-desc">定期更换密码以保护账号安全</span>
            </div>
            <button class="btn-outline">修改密码</button>
          </div>
        </div>
      </section>

      <!-- 2. Preferences -->
      <section class="settings-group">
        <div class="group-header">
          <div class="group-icon pref-icon">
            <Palette :size="16" stroke-width="1.5" />
          </div>
          <h2 class="group-title">个人偏好</h2>
        </div>
        <div class="group-card breathe-subtle">
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">界面主题</span>
              <span class="field-desc">选择你偏好的界面外观</span>
            </div>
            <div class="toggle-group">
              <button :class="['toggle-opt', { active: theme === 'light' }]" @click="theme = 'light'">
                <Sun :size="14" stroke-width="1.5" /> 浅色
              </button>
              <button :class="['toggle-opt', { active: theme === 'dark' }]" @click="theme = 'dark'">
                <Moon :size="14" stroke-width="1.5" /> 深色
              </button>
            </div>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">显示语言</span>
              <span class="field-desc">界面文字的语言</span>
            </div>
            <select v-model="language" class="field-select">
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">推送通知</span>
              <span class="field-desc">接收学习提醒和系统通知</span>
            </div>
            <button :class="['toggle-switch', { on: notifications }]" @click="notifications = !notifications" role="switch" :aria-checked="notifications">
              <span class="switch-knob" />
            </button>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">操作音效</span>
              <span class="field-desc">界面交互的提示音</span>
            </div>
            <button :class="['toggle-switch', { on: soundEnabled }]" @click="soundEnabled = !soundEnabled" role="switch" :aria-checked="soundEnabled">
              <span class="switch-knob" />
            </button>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">桌面宠物</span>
              <span class="field-desc">AI Coding Companion 是否在主页显示</span>
            </div>
            <button :class="['toggle-switch', { on: appStore.desktopPetEnabled }]" @click="appStore.setDesktopPetEnabled(!appStore.desktopPetEnabled)" role="switch" :aria-checked="appStore.desktopPetEnabled">
              <span class="switch-knob" />
            </button>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">周报邮件</span>
              <span class="field-desc">每周学习总结报告</span>
            </div>
            <button :class="['toggle-switch', { on: emailDigest }]" @click="emailDigest = !emailDigest" role="switch" :aria-checked="emailDigest">
              <span class="switch-knob" />
            </button>
          </div>
        </div>
      </section>

      <!-- 3. Learning -->
      <section class="settings-group">
        <div class="group-header">
          <div class="group-icon learn-icon">
            <BookOpen :size="16" stroke-width="1.5" />
          </div>
          <h2 class="group-title">学习偏好</h2>
        </div>
        <div class="group-card breathe-subtle">
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">学习提醒</span>
              <span class="field-desc">在设定的时间发送学习提醒</span>
            </div>
            <button :class="['toggle-switch', { on: studyReminder }]" @click="studyReminder = !studyReminder" role="switch" :aria-checked="studyReminder">
              <span class="switch-knob" />
            </button>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">提醒时间</span>
              <span class="field-desc">每天的学习提醒时间</span>
            </div>
            <input type="time" v-model="reminderTime" class="field-time" />
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">资源偏好</span>
              <span class="field-desc">优先推荐的学习资源类型</span>
            </div>
            <div class="toggle-group">
              <button :class="['toggle-opt', { active: preferredResource === 'video' }]" @click="preferredResource = 'video'">视频</button>
              <button :class="['toggle-opt', { active: preferredResource === 'text' }]" @click="preferredResource = 'text'">图文</button>
              <button :class="['toggle-opt', { active: preferredResource === 'exercise' }]" @click="preferredResource = 'exercise'">习题</button>
            </div>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">学习目标</span>
              <span class="field-desc">设定长期学习方向</span>
            </div>
            <select class="field-select">
              <option>深度学习工程师</option>
              <option>数据科学家</option>
              <option>AI 研究员</option>
              <option>全栈开发师</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 4. Privacy -->
      <section class="settings-group">
        <div class="group-header">
          <div class="group-icon privacy-icon">
            <Shield :size="16" stroke-width="1.5" />
          </div>
          <h2 class="group-title">隐私与数据</h2>
        </div>
        <div class="group-card breathe-subtle">
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">数据共享</span>
              <span class="field-desc">允许匿名数据用于改进推荐</span>
            </div>
            <button :class="['toggle-switch', { on: shareData }]" @click="shareData = !shareData" role="switch" :aria-checked="shareData">
              <span class="switch-knob" />
            </button>
          </div>
          <div class="field-row">
            <div class="field-info">
              <span class="field-label">导出数据</span>
              <span class="field-desc">下载你的学习数据和画像</span>
            </div>
            <button class="btn-outline">
              <Download :size="14" stroke-width="1.5" />
              导出
            </button>
          </div>
          <div class="field-row danger-row">
            <div class="field-info">
              <span class="field-label danger-label">清除数据</span>
              <span class="field-desc">清除所有学习记录和画像数据（不可恢复）</span>
            </div>
            <button class="btn-danger">
              <Trash2 :size="14" stroke-width="1.5" />
              清除
            </button>
          </div>
        </div>
      </section>

      <!-- 5. About -->
      <section class="settings-group">
        <div class="group-header">
          <div class="group-icon about-icon">
            <Sparkles :size="16" stroke-width="1.5" />
          </div>
          <h2 class="group-title">关于</h2>
        </div>
        <div class="group-card breathe-subtle">
          <div class="about-row">
            <span class="about-key">版本</span>
            <span class="about-value">v1.0.0</span>
          </div>
          <div class="about-row">
            <span class="about-key">框架</span>
            <span class="about-value">Vue 3 + TypeScript + Vite</span>
          </div>
          <div class="about-row">
            <span class="about-key">AI 引擎</span>
            <span class="about-value">智学星枢 AI Engine v2.4</span>
          </div>
          <div class="about-row">
            <span class="about-key">最近更新</span>
            <span class="about-value">2026-05-11</span>
          </div>
        </div>
      </section>

      <!-- 6. Account -->
      <section class="settings-group">
        <div class="group-header">
          <div class="group-icon account-icon">
            <Key :size="16" stroke-width="1.5" />
          </div>
          <h2 class="group-title">账户</h2>
        </div>
        <div class="group-card breathe-subtle">
          <div class="field-row danger-row">
            <div class="field-info">
              <span class="field-label danger-label">退出登录</span>
              <span class="field-desc">安全退出当前账号，返回登录页面</span>
            </div>
            <button class="btn-danger logout-btn" @click="handleLogout">
              <LogOut :size="14" stroke-width="1.5" />
              退出登录
            </button>
          </div>
        </div>
      </section>

      <!-- Save -->
      <div class="save-section">
        <transition name="fade">
          <div v-if="saved" class="save-toast">
            <Check :size="16" stroke-width="2" />
            <span>设置已保存</span>
          </div>
        </transition>
        <button class="save-btn" @click="saveSettings">
          <Check :size="16" stroke-width="2" />
          保存设置
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  padding: 0;
  max-width: 840px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

/* ====================== Hero ====================== */
.settings-hero {
  padding: 48px 40px 28px;
}

.hero-badge {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  background: rgba(0, 212, 255, 0.08);
  color: var(--color-accent-cyan);
  border: 1px solid rgba(0, 212, 255, 0.1);
  margin-bottom: 12px;
}

.hero-title {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 400;
  color: #fff;
  line-height: 1.2;
  margin-bottom: 8px;
}

.gradient-text {
  background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* ====================== Body ====================== */
.settings-body {
  padding: 0 40px 40px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ====================== Group ====================== */
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
}
.profile-icon { background: rgba(0, 212, 255, 0.1); color: #00d4ff; }
.pref-icon { background: rgba(0, 212, 255, 0.1); color: #00d4ff; }
.learn-icon { background: rgba(124, 58, 237, 0.1); color: #7c3aed; }
.privacy-icon { background: rgba(6, 214, 160, 0.1); color: #06d6a0; }
.api-icon { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.about-icon { background: rgba(244, 63, 94, 0.1); color: #f43f5e; }
.account-icon { background: rgba(244, 63, 94, 0.1); color: #f43f5e; }

.group-title {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 400;
  color: #fff;
}

.group-card {
  border-radius: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  overflow: hidden;
  transition: border-color 0.2s var(--ease-out);
}
.group-card:hover { border-color: rgba(0, 212, 255, 0.08); }

/* ====================== Profile Row ====================== */
.profile-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.avatar-ring {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-purple));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
}

.avatar-letter {
  font-family: var(--font-display);
  font-size: 26px;
  color: #fff;
}

.avatar-change {
  font-size: 11px;
  color: var(--color-accent-cyan);
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s var(--ease-out);
}
.avatar-change:hover { background: rgba(0, 212, 255, 0.08); }

.profile-details { flex: 1; }
.profile-name {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}
.profile-email {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 2px;
}

/* ====================== Field Row ====================== */
.field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.2s var(--ease-out);
}
.field-row:hover { background: rgba(255, 255, 255, 0.01); }
.field-row:last-child { border-bottom: none; }

.field-info { display: flex; flex-direction: column; gap: 2px; }

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.field-desc {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.danger-row .field-label { color: var(--color-accent-rose); }

/* Inputs */
.field-input {
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-primary);
  min-width: 200px;
  transition: border-color 0.2s var(--ease-out);
}
.field-input:focus { border-color: var(--color-accent-cyan); }

.field-select {
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  min-width: 150px;
}

.field-time {
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-primary);
  color-scheme: dark;
}

/* Toggle Group */
.toggle-group {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.toggle-opt {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s var(--ease-out);
}
.toggle-opt:hover { color: var(--color-text-primary); }
.toggle-opt.active {
  color: #fff;
  background: var(--color-accent-cyan);
}

/* Switch */
.toggle-switch {
  width: 42px;
  height: 24px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  position: relative;
  transition: background 0.2s var(--ease-out);
  flex-shrink: 0;
}
.toggle-switch.on { background: var(--color-accent-cyan); }

.switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s var(--ease-out);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.toggle-switch.on .switch-knob { transform: translateX(18px); }

/* Buttons */
.btn-outline {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-primary);
  transition: all 0.2s var(--ease-out);
}
.btn-outline:hover { border-color: var(--color-accent-cyan); color: var(--color-accent-cyan); }

.btn-danger {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid rgba(244, 63, 94, 0.25);
  font-size: 12px;
  color: var(--color-accent-rose);
  transition: all 0.2s var(--ease-out);
}
.btn-danger:hover { background: rgba(244, 63, 94, 0.08); }

/* ====================== About ====================== */
.about-row {
  display: flex;
  justify-content: space-between;
  padding: 14px 24px;
  border-bottom: 1px solid var(--color-border);
}
.about-row:last-child { border-bottom: none; }

.about-key { font-size: 13px; color: var(--color-text-secondary); }
.about-value { font-size: 13px; font-weight: 500; color: var(--color-text-primary); font-family: var(--font-mono); }

/* ====================== Save ====================== */
.save-section {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  padding-top: 4px;
}

.save-toast {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-accent-emerald);
  font-weight: 500;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-blue));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s var(--ease-out);
}
.save-btn:hover {
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.3);
  transform: translateY(-1px);
}

/* ====================== Responsive ====================== */
@media (max-width: 768px) {
  .settings-hero { padding: 32px 20px 24px; }
  .settings-body { padding: 0 20px 32px; }
  .field-row { flex-direction: column; align-items: flex-start; gap: 10px; }
  .field-input, .field-select { min-width: 100%; }
  .profile-row { flex-direction: column; text-align: center; }
  .save-section { flex-direction: column; }
}
</style>
