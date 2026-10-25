import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const sandboxConfigPath = fileURLToPath(new URL('../../.alipay-sandbox.json', import.meta.url))

export function sandboxSdkConfig(data) {
  const app = data?.appIds?.[0]
  const sellerId = data?.sandboxAccounts?.partner?.userId
  if (![app?.appId, app?.appPrivatePkcsKey, app?.alipayPublicKey, sellerId].every(value => typeof value === 'string' && value.length > 0)) throw new Error('invalid sandbox configuration')
  return { appId: app.appId, privateKey: app.appPrivatePkcsKey, alipayPublicKey: app.alipayPublicKey, sellerId, gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do' }
}

export function readSandboxSdkConfig() {
  try {
    const info = fs.lstatSync(sandboxConfigPath)
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new Error('unsafe sandbox configuration')
    return sandboxSdkConfig(JSON.parse(fs.readFileSync(sandboxConfigPath, 'utf8')))
  } catch {
    throw Object.assign(new Error('payment-sandbox-config-unavailable'), { code: 'payment-sandbox-config-unavailable', statusCode: 503 })
  }
}
