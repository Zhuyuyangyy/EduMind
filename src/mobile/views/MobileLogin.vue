<template>
  <section class="login">
    <div class="login__brand">
      <span class="login__logo">智学星枢</span>
      <span class="login__tag">AI 个性化学习</span>
    </div>

    <h1 class="login__title">欢迎回来</h1>
    <p class="login__subtitle">登录后继续你今天的学习</p>

    <form class="login__form" @submit.prevent="onSubmit">
      <label class="m-field">
        <span>账号</span>
        <input v-model="account" class="m-input" type="text" autocomplete="username" placeholder="评审账号 reviewer" />
      </label>
      <label class="m-field">
        <span>密码</span>
        <input v-model="password" class="m-input" type="password" autocomplete="current-password" placeholder="演示密码" />
      </label>

      <div v-if="error" class="m-error" role="alert">
        <b>{{ error.title }}</b>
        <span class="m-error__detail">{{ error.detail }}</span>
      </div>

      <button class="m-btn m-btn--primary m-btn--block" type="submit" :disabled="loading">
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>

    <p class="login__footnote">
      演示账号：reviewer / Zhixue2026!（学生端）<br />
      会话由服务端签发，有效期 7 天；退出或服务端失效后需重新登录。
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthSession } from '@/lib/auth'
import { loginDemoAccount } from '@/lib/api'
import { toFriendlyError, type FriendlyError } from '../errors'

const router = useRouter()
const account = ref('reviewer')
const password = ref('')
const loading = ref(false)
const error = ref<FriendlyError | null>(null)

onMounted(() => {
  document.title = '登录 · 智学星枢 Mobile'
})

async function onSubmit() {
  if (!account.value.trim() || !password.value) {
    error.value = { title: '请输入账号和密码', detail: '两个字段都需要填写。', reauth: false }
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await loginDemoAccount(account.value.trim(), password.value, 'student')
    setAuthSession({
      role: result.role,
      name: result.displayName,
      account: result.account,
      loginAt: new Date().toISOString(),
    }, result.token)
    const redirect = router.currentRoute.value.query.redirect
    await router.replace(typeof redirect === 'string' ? redirect : '/today')
  } catch (err) {
    // 登录接口的 401 是账号密码错误，给出可操作提示而不是“会话过期”
    if (err instanceof Error && /Request failed: 401/.test(err.message)) {
      error.value = { title: '账号或密码错误', detail: '演示账号见页面底部。', reauth: false }
    } else {
      error.value = toFriendlyError(err)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  max-width: 420px;
  margin: 7vh auto 0;
}

.login__brand {
  display: flex;
  align-items: baseline;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-8);
}

.login__logo {
  font-size: var(--m-text-2xl);
  font-weight: 800;
  letter-spacing: 1px;
  background: var(--m-gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.login__tag {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.login__title {
  font-size: var(--m-text-2xl);
  margin: 0 0 var(--m-space-1);
}

.login__subtitle {
  color: var(--m-text-dim);
  font-size: var(--m-text-md);
  margin: 0 0 var(--m-space-6);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-4);
}

.login__footnote {
  margin-top: var(--m-space-8);
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  line-height: 1.9;
}
</style>
