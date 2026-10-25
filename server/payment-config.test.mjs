import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sandboxConfigPath, sandboxSdkConfig } from './payment/config.js'
import { paymentConfig, paymentUrls } from './payment/provider.js'

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


test('public HTTPS staging base creates notify URL and production rejects insecure or loopback bases', () => {
  const saved = {
    base: process.env.PAYMENT_BASE_URL,
    env: process.env.ZHIXUE_ENV,
    node: process.env.NODE_ENV,
  }
  try {
    process.env.NODE_ENV = 'production'
    process.env.ZHIXUE_ENV = 'staging'
    process.env.PAYMENT_BASE_URL = 'https://payathon-staging.example.test'
    assert.deepEqual(paymentUrls(), {
      returnUrl: 'https://payathon-staging.example.test/api/payments/return',
      notifyUrl: 'https://payathon-staging.example.test/api/payments/notify/alipay',
    })

    process.env.ZHIXUE_ENV = 'production'
    process.env.PAYMENT_BASE_URL = 'http://payathon-staging.example.test'
    assert.throws(paymentUrls, { code: 'invalid-payment-base-url' })
    process.env.PAYMENT_BASE_URL = 'https://127.0.0.1:8788'
    assert.throws(paymentUrls, { code: 'invalid-payment-base-url' })
  } finally {
    if (saved.base === undefined) delete process.env.PAYMENT_BASE_URL; else process.env.PAYMENT_BASE_URL = saved.base
    if (saved.env === undefined) delete process.env.ZHIXUE_ENV; else process.env.ZHIXUE_ENV = saved.env
    if (saved.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.node
  }
})
