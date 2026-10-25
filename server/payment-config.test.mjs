import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sandboxConfigPath, sandboxSdkConfig } from './payment/config.js'
import { paymentConfig } from './payment/provider.js'

test('sandbox mapping uses one application and unmodified Node PKCS#1 fields', () => {
  const app = { appId: 'fixture-app', appPrivatePkcsKey: 'fixture-raw-pkcs1', appPrivateKey: 'do-not-use-java-field', alipayPublicKey: 'fixture-raw-public' }
  const config = sandboxSdkConfig({ appIds: [app, { appId: 'not-selected' }], sandboxAccounts: { partner: { userId: 'fixture-seller' } } })
  assert.deepEqual(config, { appId: app.appId, privateKey: app.appPrivatePkcsKey, alipayPublicKey: app.alipayPublicKey, sellerId: 'fixture-seller', gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do' })
  assert.equal(sandboxConfigPath, fileURLToPath(new URL('../.alipay-sandbox.json', import.meta.url)))
  assert.ok(path.isAbsolute(sandboxConfigPath))
  for (const field of ['appId', 'appPrivatePkcsKey', 'alipayPublicKey']) assert.throws(() => sandboxSdkConfig({ appIds: [{ ...app, [field]: '' }], sandboxAccounts: { partner: { userId: 'fixture-seller' } } }))
})

test('production never reads sandbox-file configuration, even when present', () => {
  const originalSource = process.env.VIBE_PAY_CONFIG_SOURCE, originalEnv = process.env.ZHIXUE_ENV
  Object.assign(process.env, { VIBE_PAY_CONFIG_SOURCE: 'sandbox-file', ZHIXUE_ENV: 'production' })
  try { assert.throws(paymentConfig, { code: 'payment-sandbox-config-forbidden' }) }
  finally {
    if (originalSource === undefined) delete process.env.VIBE_PAY_CONFIG_SOURCE; else process.env.VIBE_PAY_CONFIG_SOURCE = originalSource
    if (originalEnv === undefined) delete process.env.ZHIXUE_ENV; else process.env.ZHIXUE_ENV = originalEnv
  }
})
