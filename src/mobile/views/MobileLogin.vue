<template>
  <section class="login">
    <div class="login__hero">
      <MobileOrbit class="login__orbit" />
      <p class="login__eyebrow">给每一份好奇，一个方向</p>
      <h1 class="login__title">{{ registering ? '开启你的学习旅程' : '让学习，更适合你。' }}</h1>
      <p class="login__subtitle">从了解你开始，到看见每一次真实的进步。</p>
    </div>
    <form class="login__form" @submit.prevent="onSubmit">
      <label v-if="registering" class="m-field"><span>昵称</span><input v-model="displayName" :disabled="loading" class="m-input" autocomplete="nickname" maxlength="64" required placeholder="你希望怎样被称呼" /></label>
      <label class="m-field">
        <span>账号</span>
        <input v-model="account" :disabled="loading" class="m-input" type="text" autocomplete="username" :minlength="registering ? 3 : undefined" maxlength="64" required placeholder="输入账号" :aria-describedby="registering ? 'register-account-help' : undefined" />
      </label>
      <p v-if="registering" id="register-account-help" class="login__field-hint">账号为 3–64 个中文、字母、数字或 . _ -，不支持邮箱格式。</p>
      <label class="m-field">
        <span>密码</span>
        <input v-model="password" :disabled="loading" class="m-input" type="password" :autocomplete="registering ? 'new-password' : 'current-password'" :minlength="registering ? 8 : undefined" maxlength="128" required :placeholder="registering ? '至少 8 个字符' : '输入密码'" />
      </label>

      <div v-if="error" class="m-error" role="alert">
        <b>{{ error.title }}</b>
        <span class="m-error__detail">{{ error.detail }}</span>
      </div>

      <button class="m-btn m-btn--primary m-btn--block" type="submit" :disabled="loading">
        {{ loading ? '正在处理…' : existingAccount ? '用此账号登录' : registering ? '创建账号并开始学习' : '登录' }}
      </button>
    </form>
    <button class="login__switch" :disabled="loading" @click="registering = !registering; error = null; existingAccount = false; password = ''">{{ registering ? '已有账号？返回登录' : '第一次来？创建学习账号' }}</button>

    <p v-if="demoMode" class="login__footnote">
      演示账号：reviewer / Zhixue2026!（学生端）<br />
      会话由服务端签发，有效期 7 天；退出或服务端失效后需重新登录。
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { completeLogin } from '@/lib/auth'
import { loginDemoAccount, apiPost } from '@/lib/api'
import { resetStudyLocalState } from '@/mobile/data/study'
import { toFriendlyError, type FriendlyError } from '../errors'
import MobileOrbit from '../components/MobileOrbit.vue'

const router = useRouter()
const route = useRoute()
const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
const account = ref(demoMode ? 'reviewer' : '')
const password = ref('')
const registering = ref(route.query.register === '1')
const displayName = ref('')
const loading = ref(false)
const error = ref<FriendlyError | null>(null)
const existingAccount = ref(false)
watch(account, () => { existingAccount.value = false; error.value = null })

onMounted(() => {
  document.title = '登录 · 智学星枢 Mobile'
})

watch(() => route.query.register, value => {
  registering.value = value === '1'
  error.value = null
  existingAccount.value = false
})

async function onSubmit() {
  if (loading.value) return
  if (!account.value.trim() || !password.value) {
    error.value = { title: '请输入账号和密码', detail: '两个字段都需要填写。', reauth: false }
    return
  }
  if (existingAccount.value) registering.value = false
  loading.value = true
  error.value = null
  existingAccount.value = false
  const wasRegistering = registering.value
  let accountCreated = false
  try {
    if (registering.value) {
      await apiPost('/api/auth/register', { account: account.value.trim(), password: password.value, displayName: displayName.value.trim() })
      accountCreated = true
      registering.value = false
    }
    const result = await loginDemoAccount(account.value.trim(), password.value, 'student')
    await completeLogin({
      role: result.role,
      name: result.displayName,
      account: result.account,
      loginAt: new Date().toISOString(),
    }, result.token)
    // 新账号纪元：丢弃任何在途的旧账号数据响应
    resetStudyLocalState() // 清幂等键 + 纪元+1
    const redirect = router.currentRoute.value.query.redirect
    await router.replace(typeof redirect === 'string' ? redirect : '/today')
  } catch (err) {
    const failure = err as { code?: string; status?: number; message?: string } | null
    if (wasRegistering && !accountCreated && (failure?.code === 'account-exists' || failure?.status === 409 || /Request failed:\s*409/.test(failure?.message || ''))) {
      registering.value = false
      existingAccount.value = true
      error.value = toFriendlyError({ code: 'account-exists' })
      return
    }
    // 登录接口的 401 是账号密码错误，给出可操作提示而不是“会话过期”
    if (err instanceof Error && /Request failed: 401/.test(err.message)) {
      error.value = { title: '账号或密码错误', detail: '请检查账号与密码后重试。', reauth: false }
    } else {
      error.value = toFriendlyError(err)
    }
    if (accountCreated) {
      error.value = { title: '账号已创建，登录未完成', detail: `${error.value.detail} 可直接登录，无需重新注册。`, reauth: false }
    }
  } finally {
    loading.value = false
  }
}

</script>

<style scoped>
.login__hero { text-align: center; margin-bottom: 24px; }
.login__orbit { width: 180px; height: 156px; object-fit: cover; margin: -8px auto 4px; }
.login__eyebrow { font-size: 11px; color: var(--m-primary); letter-spacing: 1px; margin: 0 0 12px; }
.login__hero .login__title { font-size: 28px; font-weight: 600; letter-spacing: -1px; }
.login__hero .login__subtitle { font-size: 12px; margin: 10px 0 0; }
.login__form { padding: 24px; border: 1px solid var(--m-border); background: var(--m-surface); border-radius: 25px; box-shadow: var(--m-shadow-card); }
.login__form .m-field { font-size: 12px; gap: 10px; }
.login__form .m-input { border-radius: 12px; background: #fafbfe; }
.login__form .m-btn { margin-top: 6px; font-size: 14px; }
.login__field-hint { margin: -6px 0 0; color: var(--m-text-faint); font-size: 12px; line-height: 1.7; }

.login__switch { display: block; margin: 16px auto 0; min-height: 44px; border: 0; background: transparent; color: var(--m-primary); font: inherit; font-size: 14px; cursor: pointer; }
.login {
  max-width: 420px;
  margin: 0 auto;
}

.login__logo-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--m-primary-soft);

  color: var(--m-primary);

  margin-bottom: var(--m-space-2);
}

.login__brand {
  display: flex;
  align-items: baseline;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-8);
}

.login__logo {
  font-size: var(--m-text-lg);
  font-weight: 650;
  letter-spacing: 1px;
  color: var(--m-text);
}

.login__tag {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.login__title {
  font-size: var(--m-text-2xl);
  letter-spacing: -1px;
  margin: 0 0 var(--m-space-3);
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
