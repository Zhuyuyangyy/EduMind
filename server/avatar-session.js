import crypto from 'node:crypto'

const DEFAULT_SERVER_URL = 'wss://avatar.cn-huadong-1.xf-yun.com/v1/interact'

export function getAvatarConfig() {
  return {
    serverUrl: process.env.AVATAR_SERVER_URL || DEFAULT_SERVER_URL,
    apiKey: process.env.AVATAR_API_KEY || '',
    apiSecret: process.env.AVATAR_API_SECRET || '',
  }
}

export function isAvatarConfigured() {
  const { apiKey, apiSecret } = getAvatarConfig()
  return Boolean(apiKey && apiSecret)
}

// Mirrors the SDK's client-side signer so the browser only ever receives a
// short-lived signedUrl, never the long-lived apiKey/apiSecret.
export function mintAvatarSignedUrl({ serverUrl, apiKey, apiSecret, date = new Date().toUTCString() }) {
  const match = serverUrl.match(/^wss?:\/\/([^/]+)(\/.*)/)
  if (!match) throw new Error('invalid avatar serverUrl')
  const host = match[1]
  const path = match[2]
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin, 'utf8').toString('base64')
  return `${serverUrl}?authorization=${authorization}&date=${date}&host=${host}`
}

export function buildAvatarSessionPayload() {
  if (!isAvatarConfigured()) return null
  const { serverUrl, apiKey, apiSecret } = getAvatarConfig()
  return { signedUrl: mintAvatarSignedUrl({ serverUrl, apiKey, apiSecret }), serverUrl }
}