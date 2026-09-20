const INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b[\s\S]{0,80}\b(?:previous|prior|above|system|developer)\b[\s\S]{0,40}\b(?:instructions?|rules?|prompts?)\b/i,
  /\b(?:reveal|show|print|output|repeat|leak|expose)\b[\s\S]{0,60}\b(?:system|developer|internal|hidden)\b[\s\S]{0,30}\b(?:prompts?|instructions?|messages?|configuration)\b/i,
  /\b(?:reveal|show|print|output|leak|expose)\b[\s\S]{0,60}\b(?:api[\s_-]*keys?|secrets?|tokens?|passwords?|credentials?)\b/i,
  /(?:忽略|无视|绕过|覆盖|忘掉)[\s\S]{0,30}(?:之前|此前|以上|原有|系统|开发者)[\s\S]{0,20}(?:指令|规则|提示词|要求)/i,
  /(?:显示|输出|打印|复述|泄露|提供|暴露)[\s\S]{0,40}(?:系统|开发者|内部|隐藏)[\s\S]{0,20}(?:提示词|指令|消息|配置)/i,
  /(?:显示|输出|打印|泄露|提供|暴露)[\s\S]{0,40}(?:API[\s_-]*密钥|密钥|令牌|密码|凭据)/i,
]

export function detectPromptInjection(input) {
  const text = String(input ?? '').normalize('NFKC').trim()
  if (!text) return []
  return INJECTION_PATTERNS.some(pattern => pattern.test(text)) ? ['prompt-injection'] : []
}
