<template>
  <section class="login">
    <h1 class="title">进入智学星枢</h1>
    <p class="hint">Android 最小原型 · P1</p>

    <form class="form" @submit.prevent="onSubmit">
      <label class="field">
        <span>账号</span>
        <input v-model="account" type="text" autocomplete="username" placeholder="评审账号 reviewer" />
      </label>
      <label class="field">
        <span>密码</span>
        <input v-model="password" type="password" autocomplete="current-password" placeholder="演示密码" />
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button class="submit" type="submit" :disabled="loading">
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>

    <p class="footnote">
      演示账号：reviewer / Zhixue2026!（学生端）。会话由服务端签发，有效期 7 天。
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthSession } from '@/lib/auth'
import { loginDemoAccount } from '@/lib/api'
import { toFriendlyError } from '../errors'

const router = useRouter()
const account = ref('reviewer')
const password = ref('')
const loading = ref(false)
const error = ref('')

onMounted(() => {
  document.title = '登录 · 智学星枢 Mobile'
})

async function onSubmit() {
  if (!account.value.trim() || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = await loginDemoAccount(account.value.trim(), password.value, 'student')
    setAuthSession({
      role: result.role,
      name: result.displayName,
      account: result.account,
      loginAt: new Date().toISOString(),
    }, result.token)
    const redirect = router.currentRoute.value.query.redirect
    await router.replace(typeof redirect === 'string' ? redirect : '/tutor')
  } catch (err) {
    const friendly = toFriendlyError(err)
    // 登录接口的 401 是账号密码错误，给出可操作提示而不是“会话过期”
    error.value = /Request failed: 401/.test(err instanceof Error ? err.message : '')
      ? '账号或密码错误（演示账号见页面底部）'
      : `${friendly.title}：${friendly.detail}`
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  max-width: 420px;
  margin: 6vh auto 0;
}

.title {
  font-size: 24px;
  margin: 0 0 4px;
}

.hint {
  color: #6f8ba6;
  font-size: 13px;
  margin: 0 0 28px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #9eb6ca;
}

.field input {
  background: #0e2033;
  border: 1px solid #285275;
  border-radius: 12px;
  padding: 13px 14px;
  font-size: 16px; /* 避免 iOS 聚焦自动放大 */
  color: #e9f4ff;
  outline: none;
}

.field input:focus {
  border-color: #54d6ff;
}

.error {
  background: #3a1620;
  border: 1px solid #6b2233;
  color: #ff9ca8;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  margin: 0;
}

.submit {
  background: linear-gradient(135deg, #1f6feb, #54d6ff);
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  color: #04121f;
  cursor: pointer;
}

.submit:disabled {
  opacity: 0.6;
}

.footnote {
  margin-top: 28px;
  font-size: 12px;
  color: #5f7d95;
  line-height: 1.7;
}
</style>
