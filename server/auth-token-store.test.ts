import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * P4-1C 凭据存储门禁（纯逻辑；平台适配通过注入验证）。
 */

const {
  readCookieValue,
  createWebTokenStore,
  createNativeTokenStore,
  createFallbackNativeStore,
  allowInsecureFallback,
  LEGACY_TOKEN_KEY,
  SECURE_TOKEN_KEY,
  SECURE_ORIGIN_KEY,
  CSRF_COOKIE_NAME,
} = await import('../src/lib/auth-token-store.ts')

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

function memorySecure() {
  const map = new Map<string, string>()
  return {
    get: async (key: string) => (map.has(key) ? map.get(key)! : null),
    set: async (key: string, value: string) => { map.set(key, value) },
    remove: async (key: string) => { map.delete(key) },
  }
}

test('Web 存储不持有 Bearer token（Cookie 承载会话）', async () => {
  const storage = memoryStorage()
  const store = createWebTokenStore(storage, () => '')
  await store.setToken('should-not-be-stored', 'https://yx.shushubiye.fun')
  assert.equal(await store.getToken('https://yx.shushubiye.fun'), null, 'Web 不得返回 Bearer token')
  assert.equal(storage.getItem(LEGACY_TOKEN_KEY), null, 'Web 不得把 token 写进 localStorage')
})

test('Web 从 Cookie 读 CSRF Token', async () => {
  const store = createWebTokenStore(memoryStorage(), () => `${CSRF_COOKIE_NAME}=abc123; other=1`)
  assert.equal(await store.getCsrfToken(), 'abc123')
  const empty = createWebTokenStore(memoryStorage(), () => '')
  assert.equal(await empty.getCsrfToken(), null)
})

test('原生安全存储：token 按 origin 绑定，不匹配不外发', async () => {
  const secure = memorySecure()
  const store = createNativeTokenStore(secure)
  await store.setToken('keystore-token', 'https://yx.shushubiye.fun')
  assert.equal(await store.getToken('https://yx.shushubiye.fun'), 'keystore-token')
  assert.equal(await store.getToken('https://evil.example.com'), null, 'origin 不匹配绝不外发')
  await store.clearToken()
  assert.equal(await store.getToken('https://yx.shushubiye.fun'), null)
  assert.equal(await secure.get(SECURE_ORIGIN_KEY), null, '清除应同时移除 origin 绑定')
})

test('遗留明文 token 被迁移清理（Web 与原生）', async () => {
  const webStorage = memoryStorage()
  webStorage.setItem(LEGACY_TOKEN_KEY, 'legacy-plaintext-token')
  const web = createWebTokenStore(webStorage, () => '')
  const webResult = await web.migrate()
  assert.equal(webResult.clearedLegacyToken, true)
  assert.equal(webStorage.getItem(LEGACY_TOKEN_KEY), null)

  const nativeStorage = memoryStorage()
  nativeStorage.setItem(LEGACY_TOKEN_KEY, 'legacy-plaintext-token')
  const native = createNativeTokenStore(memorySecure(), { insecureFallback: nativeStorage })
  const nativeResult = await native.migrate()
  assert.equal(nativeResult.clearedLegacyToken, true)
  assert.equal(nativeStorage.getItem(LEGACY_TOKEN_KEY), null)
})

test('生产构建拒绝非安全回退', async () => {
  assert.equal(allowInsecureFallback({ prod: true }), false)
  assert.equal(allowInsecureFallback({ prod: false }), true)
  assert.equal(allowInsecureFallback({ prod: true, allowFlag: true }), true)

  const store = createFallbackNativeStore(memoryStorage(), true)
  await assert.rejects(() => store.getToken('https://x'), /拒绝明文回退/)
  await assert.rejects(() => store.setToken('t', 'https://x'), /拒绝明文回退/)
})

test('开发模式回退可用但 origin 绑定仍然生效', async () => {
  const storage = memoryStorage()
  const store = createFallbackNativeStore(storage, false)
  await store.setToken('dev-token', 'https://a.example.com')
  assert.equal(await store.getToken('https://a.example.com'), 'dev-token')
  assert.equal(await store.getToken('https://b.example.com'), null)
})

test('Cookie 值解析（编码/空值/无匹配）', () => {
  assert.equal(readCookieValue('a=1; edumind_csrf=x%20y', 'edumind_csrf'), 'x y')
  assert.equal(readCookieValue('a=1', 'missing'), null)
  assert.equal(readCookieValue(null, 'a'), null)
  assert.equal(readCookieValue('=novalue; b=2', 'b'), '2')
})
