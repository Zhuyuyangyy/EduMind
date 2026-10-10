/** 移动端统一错误反馈映射（P1 · feat/mobile-v1）：把网络/HTTP 错误翻译成用户能行动的中文提示。 */

export interface FriendlyError {
  title: string
  detail: string
  /** 是否需要引导用户重新登录 */
  reauth: boolean
}

const NETWORK_DETAIL = '请检查：① API 地址是否正确（状态页可修改）② 手机能否访问该地址 ③ 服务是否已启动'

export function toFriendlyError(error: unknown): FriendlyError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { title: '请求超时', detail: '服务器超过 60 秒未响应，请稍后重试或切换网络。', reauth: false }
  }
  if (error instanceof TypeError) {
    // fetch 在网络层失败时统一抛 TypeError
    return { title: '网络不可达', detail: NETWORK_DETAIL, reauth: false }
  }

  const message = error instanceof Error ? error.message : String(error)
  const statusMatch = message.match(/Request failed:\s*(\d{3})/)
  const status = statusMatch ? Number(statusMatch[1]) : null

  switch (status) {
    case 400:
      return { title: '请求有误', detail: '提交的内容不完整或格式不正确，请调整后重试。', reauth: false }
    case 401:
      return { title: '登录已过期', detail: '服务端会话已失效，请重新登录。', reauth: true }
    case 403:
      return { title: '没有权限', detail: '当前账号不能执行这个操作。', reauth: false }
    case 404:
      return { title: '接口不存在', detail: 'API 地址可能指向了旧版本服务，请在状态页核对地址。', reauth: false }
    case 413:
      return { title: '内容过长', detail: '提交的内容超过了服务器允许的大小。', reauth: false }
    case 500:
    case 502:
    case 503:
      return { title: '服务器开小差', detail: '服务端处理出错，稍后重试；若持续出现请联系维护者。', reauth: false }
    default:
      if (status) {
        return { title: `请求失败（${status}）`, detail: '服务端返回了意外状态，请稍后重试。', reauth: false }
      }
      return { title: '请求失败', detail: NETWORK_DETAIL, reauth: false }
  }
}
