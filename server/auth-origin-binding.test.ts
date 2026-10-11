import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * P4-1A 凭据 origin 绑定（先于接线编写；纯逻辑门禁）。
 *
 * 复现的是审计发现的 P0：切换 API Base 后，api.ts 仍从 localStorage
 * 读取旧 token 并发往新地址（健康检测等请求携带着 A 服务的 Bearer）。
 */

const {
  bindToken,
  getTokenForOrigin,
  clearTokenBinding,
  isOriginChange,
  effectiveOrigin,
  originOf,
  isTrustedApiBase,
} = await import('../src/lib/auth-origin.ts')

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

test('token 绑定 origin：当前 origin 不匹配时不可取用（不泄露给新服务）', () => {
  const storage = memoryStorage()
  bindToken(storage, 'token-from-server-A', 'https://a.example.com')

  // 同一 origin：可取用
  assert.equal(getTokenForOrigin(storage, 'https://a.example.com'), 'token-from-server-A')
  // 切到 B：绝不能把 A 的 token 交出去
  assert.equal(getTokenForOrigin(storage, 'https://b.example.com'), null)
  // 相对路径部署（页面源）与绑定 origin 不同：同样拒绝
  assert.equal(getTokenForOrigin(storage, 'http://localhost:5174'), null)
})

test('origin 切换判定：有绑定且目标不同 → 必须解绑重登', () => {
  const storage = memoryStorage()
  assert.equal(isOriginChange(storage, 'https://b.example.com'), false, '无绑定凭据时不存在切换风险')
  bindToken(storage, 't', 'https://a.example.com')
  assert.equal(isOriginChange(storage, 'https://b.example.com'), true, '绑定了 A 而切到 B 必须判定为切换')
  assert.equal(isOriginChange(storage, 'https://a.example.com'), false, '同一 origin 不是切换')
})

test('解绑后本地无凭据残留', () => {
  const storage = memoryStorage()
  bindToken(storage, 'token-from-server-A', 'https://a.example.com')
  storage.setItem('edumind-auth-session', '{"account":"reviewer"}')
  clearTokenBinding(storage)
  assert.equal(getTokenForOrigin(storage, 'https://a.example.com'), null)
  assert.equal(storage.getItem('edumind-auth-session'), null)
})

test('相对路径与绝对地址的 origin 归一', () => {
  assert.equal(originOf('https://yx.shushubiye.fun/'), 'https://yx.shushubiye.fun')
  assert.equal(originOf('https://yx.shushubiye.fun/api'), 'https://yx.shushubiye.fun')
  assert.equal(originOf(''), null)
  assert.equal(originOf('not-a-url'), null)
  assert.equal(effectiveOrigin('', 'https://yx.shushubiye.fun'), 'https://yx.shushubiye.fun')
  assert.equal(effectiveOrigin('https://a.example.com', 'https://yx.shushubiye.fun'), 'https://a.example.com')
})

test('生产可信主机白名单：任意 HTTPS 不再视为可信', () => {
  // 无白名单 → 一律拒绝（审计指出的「任意合法 HTTPS」风险）
  const noList = isTrustedApiBase('https://evil.example.com', {})
  assert.equal(noList.ok, false, '未配置白名单必须拒绝')

  // 白名单内 → 放行
  const allowed = isTrustedApiBase('https://yx.shushubiye.fun', {
    allowlist: ['yx.shushubiye.fun'],
    buildTimeBase: 'https://yx.shushubiye.fun',
  })
  assert.equal(allowed.ok, true)

  // 白名单外 → 拒绝
  const denied = isTrustedApiBase('https://evil.example.com', {
    allowlist: ['yx.shushubiye.fun'],
    buildTimeBase: 'https://yx.shushubiye.fun',
  })
  assert.equal(denied.ok, false, '白名单外主机必须拒绝')

  // 构建时基址自动进入白名单
  const buildTime = isTrustedApiBase('https://yx.shushubiye.fun', { buildTimeBase: 'https://yx.shushubiye.fun' })
  assert.equal(buildTime.ok, true)

  // 非 HTTPS 一律拒绝
  const http = isTrustedApiBase('http://yx.shushubiye.fun', { allowlist: ['yx.shushubiye.fun'] })
  assert.equal(http.ok, false)
})
