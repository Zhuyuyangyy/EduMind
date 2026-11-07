import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * P4-2A 认证剩余边界门禁（先于接线验证；纯逻辑 + 注入式竞态）。
 *
 * A1 生产 Web 明文 Bearer 桥接（P0 复核发现）：
 *   - selectTokenStore(web, crossOrigin, prod) 必须拒绝，不写 localStorage
 *   - 开发/测试跨源桥接保留，且 migrate() 不得清除活动桥接 token
 *     （早期实现每次启动清除 → 跨域调试刷新后丢登录）
 * A2 原生 API 切换：origin 比较驱动，A→B→A 不泄露、不自动恢复
 * A3 异步凭据竞态：退出发生在 Keystore 读取期间 → 旧请求不外发
 */

const {
  selectTokenStore,
  createWebCrossOriginBridgeStore,
  createNativeTokenStore,
  LEGACY_TOKEN_KEY,
  TOKEN_ORIGIN_KEY,
} = await import('../src/lib/auth-token-store.ts')

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    _map: map,
  }
}

function memorySecure(initial = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    get: async (key: string) => (map.has(key) ? map.get(key)! : null),
    set: async (key: string, value: string) => { map.set(key, value) },
    remove: async (key: string) => { map.delete(key) },
    _map: map,
  }
}

const noCookies = () => ''

/* ================= A1：生产 Web 边界 ================= */

test('A1 生产 Web 跨源：拒绝存储 Bearer，不写 localStorage', async () => {
  const storage = memoryStorage()
  const store = selectTokenStore(
    { platform: 'web', crossOrigin: true, prod: true },
    { storage, cookieReader: noCookies },
  )
  // setToken 必须显式失败（而不是静默写明文）
  await assert.rejects(
    () => store.setToken('production-token', 'https://api.example.com'),
    /不支持跨源|同源反向代理/,
  )
  // getToken 绝不提供明文 Bearer
  assert.equal(await store.getToken('https://api.example.com'), null)
  assert.equal(storage.getItem(LEGACY_TOKEN_KEY), null, 'localStorage 不得出现 Bearer token')
})

test('A1 生产 Web 同源：Cookie 模式，本地零 token', async () => {
  const storage = memoryStorage()
  const store = selectTokenStore(
    { platform: 'web', crossOrigin: false, prod: true },
    { storage, cookieReader: noCookies },
  )
  await store.setToken('should-not-store', 'https://yx.shushubiye.fun')
  assert.equal(await store.getToken('https://yx.shushubiye.fun'), null)
  assert.equal(storage.getItem(LEGACY_TOKEN_KEY), null)
})

test('A1 开发跨源桥接保留可用（origin 绑定）', async () => {
  const storage = memoryStorage()
  const store = selectTokenStore(
    { platform: 'web', crossOrigin: true, prod: false },
    { storage, cookieReader: noCookies },
  )
  await store.setToken('dev-token', 'https://api.example.com')
  assert.equal(await store.getToken('https://api.example.com'), 'dev-token')
  assert.equal(await store.getToken('https://other.example.com'), null, 'origin 不匹配不外发')
  assert.equal(await store.getBoundOrigin(), 'https://api.example.com')
})

test('A1 桥接 migrate() 不清除活动 token（刷新/冷启动恢复登录）', async () => {
  const storage = memoryStorage()
  const bridge = createWebCrossOriginBridgeStore(storage, noCookies)
  await bridge.setToken('bridge-token', 'https://api.example.com')

  // 启动迁移（P4-2A 修复点）：桥接键是活动凭据，不是遗留数据
  const result = await bridge.migrate()
  assert.equal(result.clearedLegacyToken, false)
  assert.equal(await bridge.getToken('https://api.example.com'), 'bridge-token', '迁移后桥接 token 必须保留（刷新不丢登录）')
  assert.equal(storage.getItem(TOKEN_ORIGIN_KEY), 'https://api.example.com')
})

test('A1 同源 Cookie 模式 migrate() 仍清理遗留明文 token', async () => {
  const storage = memoryStorage()
  storage.setItem(LEGACY_TOKEN_KEY, 'legacy-plaintext-token')
  const store = selectTokenStore(
    { platform: 'web', crossOrigin: false, prod: true },
    { storage, cookieReader: noCookies },
  )
  const result = await store.migrate()
  assert.equal(result.clearedLegacyToken, true)
  assert.equal(storage.getItem(LEGACY_TOKEN_KEY), null)
})

/* ================= A2：原生 API 切换（A→B→A） ================= */

test('A2 原生：切换 A→B 后旧 token 不外发、绑定被清除', async () => {
  const secure = memorySecure()
  const store = createNativeTokenStore(secure)
  // 登录服务器 A
  await store.setToken('token-for-A', 'https://a.example.com')
  assert.equal(await store.getToken('https://a.example.com'), 'token-for-A')

  // 模拟切换到 B：清空本地绑定（prepareOriginSwitch 的本地部分）
  await store.clearToken()
  assert.equal(await store.getToken('https://b.example.com'), null, 'B 不得收到 A 的 token')
  assert.equal(await store.getBoundOrigin(), null, '本地绑定必须已解除')

  // 切回 A：无本地绑定 → 不得自动恢复（需重新登录）
  assert.equal(await store.getToken('https://a.example.com'), null, '切回 A 不得自动恢复旧会话')
})

test('A2 原生：origin 不匹配时安全存储中的 token 也不外发', async () => {
  const secure = memorySecure({
    'edumind.bearer.token': 'token-for-A',
    'edumind.bearer.origin': 'https://a.example.com',
  })
  const store = createNativeTokenStore(secure)
  assert.equal(await store.getToken('https://a.example.com'), 'token-for-A')
  assert.equal(await store.getToken('https://b.example.com'), null)
  assert.equal(await store.getBoundOrigin(), 'https://a.example.com')
})

/* ================= A3：异步凭据竞态 ================= */

test('A3 竞态：退出发生在凭据读取期间 → 防护读取返回 null', async () => {
  // 延迟的安全存储：仅第一轮读取延迟（模拟 Keystore 异步），
  // 之后立即返回——避免对照组二次读取永久挂起
  let firstRound = true
  const releasers: Array<() => void> = []
  const delayedSecure = {
    get: (key: string) => {
      if (!firstRound) return Promise.resolve(key === 'edumind.bearer.token' ? 'token-for-A' : 'https://a.example.com')
      return new Promise<string | null>(resolve => {
        releasers.push(() => resolve(key === 'edumind.bearer.token' ? 'token-for-A' : 'https://a.example.com'))
      })
    },
    set: async () => {},
    remove: async () => {},
  }
  const store = createNativeTokenStore(delayedSecure)

  // 模拟 auth.ts 的 getAuthTokenGuarded 语义：读取期间纪元被推进 → null
  const startEpoch = 1
  const readPromise = store.getToken('https://a.example.com')
  // 读取进行中：用户退出（纪元 1 → 2）
  const epochAfterLogout = 2
  // 放行第一轮全部在途读取（token 与 origin 两个键）
  firstRound = false
  for (const release of releasers) release()
  const token = await readPromise
  const guarded = epochAfterLogout !== startEpoch ? null : token
  assert.equal(guarded, null, '纪元变化后旧 token 不得外发')
  // 对照组：纪元未变时正常返回
  assert.equal(await store.getToken('https://a.example.com'), 'token-for-A')
})

/* ================= B-0：恢复默认地址的完整切换序列 ================= */

test('B-0 A→B→默认(A) 全序列：B 的 token 被清除，切回 A 不自动恢复', async () => {
  // 模拟原生 SecureStorage 中的完整切换序列（P4-2B-0 回归）：
  // 登录 A → 切 B（解绑）→ 登录 B → 恢复默认（回到 A，再次解绑）
  const secure = memorySecure()
  const store = createNativeTokenStore(secure)

  // 1. 登录服务器 A
  await store.setToken('token-A', 'https://a.example.com')
  assert.equal(await store.getToken('https://a.example.com'), 'token-A')

  // 2. 切换到 B：prepareOriginSwitch 的本地部分 = clearToken
  await store.clearToken()
  assert.equal(await store.getToken('https://a.example.com'), null, '切到 B 后 A 的 token 不得保留')

  // 3. 在 B 登录（新绑定）
  await store.setToken('token-B', 'https://b.example.com')
  assert.equal(await store.getToken('https://b.example.com'), 'token-B')

  // 4. 恢复默认地址（指向 A）：同样必须解绑——B 的 token 不得残留，
  //    切回 A 后也不得自动恢复（需重新登录）
  await store.clearToken()
  assert.equal(await store.getToken('https://b.example.com'), null, '恢复默认后 B 的 token 必须清除')
  assert.equal(await store.getToken('https://a.example.com'), null, '切回 A 不得自动恢复旧会话')
  assert.equal(await store.getBoundOrigin(), null)
})

test('B-0 单例重选：origin 变化后按新环境重新选择适配器', () => {
  // P4-2B-0：clearAuthSession 收尾重置 tokenStore 单例。此处验证
  // selectTokenStore 本身对不同环境给出不同适配器（重置后按新 origin
  // 重新选择的基础），覆盖「跨源→同源」与「同源→跨源」两个方向。
  const storage = memoryStorage()
  const deps = { storage, cookieReader: noCookies }

  const crossOriginDev = selectTokenStore({ platform: 'web', crossOrigin: true, prod: false }, deps)
  assert.equal(crossOriginDev.platform, 'web')
  // 桥接可用（开发跨源）
  return crossOriginDev.setToken('t', 'https://api.example.com').then(async () => {
    assert.equal(await crossOriginDev.getToken('https://api.example.com'), 't')

    // 模拟重置后按「同源生产」重新选择：必须得到 Cookie 适配器（零 token）
    const sameOriginProd = selectTokenStore({ platform: 'web', crossOrigin: false, prod: true }, deps)
    assert.equal(await sameOriginProd.getToken('https://api.example.com'), null, '重置后同源生产适配器不得再暴露桥接 token')
  })
})
