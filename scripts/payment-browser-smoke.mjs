import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { chromium } from '@playwright/test'
import { withTestServer } from '../server/test-server.mjs'
import { createCheckout } from '../server/payment/provider.js'

process.env.PAYMENT_PROVIDER = 'mock'
const directory = 'outputs/payment-browser'
fs.mkdirSync(directory, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checks = 0
try {
  await withTestServer(async ({ baseUrl }) => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${baseUrl}/api/payments/return`)
    await page.getByRole('heading', { name: '正在确认支付结果' }).waitFor()
    assert.match(await page.locator('main').innerText(), /不代表支付成功/)
    await page.screenshot({ path: `${directory}/return-neutral.png` }); checks++
    await page.goto(`${baseUrl}/api/payments/return?out_trade_no=private-order&trade_status=TRADE_SUCCESS&total_amount=100.00`)
    assert.ok(!(await page.locator('body').innerText()).includes('private-order'))
    await page.getByRole('heading', { name: '正在确认支付结果' }).waitFor(); checks++
    const login = await page.request.post(`${baseUrl}/api/auth/login`, { data: { account: 'reviewer', password: 'Zhixue2026!', role: 'student' } })
    assert.equal(login.status(), 200)
    await page.goto(`${baseUrl}/api/payments/mock/checkout?orderId=untrusted`)
    await page.getByRole('heading', { name: '模拟支付，仅供开发测试' }).waitFor()
    await page.screenshot({ path: `${directory}/mock-explicit.png` }); checks++

    // Verify the POST form as interpreted by a browser; route interception prevents
    // every external request. Ephemeral keys are test fixtures, not sandbox credentials.
    const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKey = merchant.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    process.env.PAYMENT_PROVIDER = 'vibe-pay'
    Object.assign(process.env, { VIBE_PAY_APP_ID: 'browser-fixture', VIBE_PAY_SELLER_ID: 'browser-seller', VIBE_PAY_GATEWAY: 'http://127.0.0.1:1/gateway.do',
      VIBE_PAY_PRIVATE_KEY: merchant.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(), VIBE_PAY_ALIPAY_PUBLIC_KEY: publicKey })
    const checkout = createCheckout({ order: { id: 'browser-fixture-order', amountCents: 100 }, product: { name: '智学星枢 + % & 专项包' }, returnUrl: `${baseUrl}/api/payments/return` })
    let resolvePost
    const posted = new Promise(resolve => { resolvePost = resolve })
    await page.route('http://127.0.0.1:1/gateway.do**', async route => {
      resolvePost(route.request())
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>本地协议测试网关</h1>' })
    })
    await page.setContent(checkout.paymentHtml)
    const request = await posted
    assert.equal(request.method(), 'POST')
    const params = Object.fromEntries(new URL(request.url()).searchParams)
    for (const [key, value] of new URLSearchParams(request.postData())) params[key] = value
    const canonical = Object.keys(params).filter(key => key !== 'sign').sort().map(key => `${key}=${params[key]}`).join('&')
    assert.equal(crypto.verify('RSA-SHA256', Buffer.from(canonical), publicKey, Buffer.from(params.sign, 'base64')), true)
    assert.equal(JSON.parse(params.biz_content).subject, '智学星枢 + % & 专项包')
    assert.equal(params.return_url, `${baseUrl}/api/payments/return`); checks++
    assert.deepEqual(errors, [])
    await page.close()
  })
  console.log(`Payment browser smoke: ${checks}/${checks} passed (Chromium; local protocol fixtures only)`)
} finally { await browser.close() }
