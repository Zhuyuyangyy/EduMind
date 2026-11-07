import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {chromium} from '@playwright/test'

// Use the same running preview as the user, without replacing its server or data.
const origin=process.env.EDUMIND_LIVE_URL||'http://127.0.0.1:5174'
const out=path.resolve('outputs/auth-live-fix')
fs.mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'D:/cloakbrowser-windows-x64/chrome.exe',headless:true})
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
context.setDefaultTimeout(15000)
const page=await context.newPage(),responses=[],errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('response',async response=>{
 const pathname=new URL(response.url()).pathname
 if(!['/api/auth/register','/api/auth/login','/api/auth/session'].includes(pathname))return
 let data={};try{data=await response.json()}catch{}
 // Do not retain credentials, tokens, cookies or request bodies.
 responses.push({pathname,status:response.status(),code:data.code||null,message:data.message||null})
})
const pass=name=>{checks.push(name);console.log(`PASS ${name}`)}
const account=`auth-live-${Date.now()}`,password=crypto.randomUUID()
async function registration(id){
 await page.goto(`${origin}/?preview=auth-live-fix#/login`)
 await page.locator('.login__form').waitFor();const entry=page.getByRole('button',{name:'第一次来？创建学习账号',exact:true});if(await entry.count())await entry.click()
 await page.getByLabel('昵称',{exact:true}).fill('注册流程检查')
 await page.getByLabel('账号',{exact:true}).fill(id)
 await page.getByLabel('密码',{exact:true}).fill(password)
}
try{
 await registration(account)
 await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click()
 await page.locator('.today__hello').waitFor()
 await page.getByRole('dialog').waitFor()
 await page.getByRole('button',{name:'稍后再说',exact:true}).click()
 const session=await page.evaluate(async()=>{const r=await fetch('/api/auth/session');const data=await r.json();return{status:r.status,account:data.account}})
 assert.equal(session.status,200);assert.equal(session.account,account)
 await page.locator('.dashboard-grid').waitFor()
 const workspace=await page.evaluate(async()=>{const r=await fetch('/api/workspace');return{status:r.status}})
 assert.equal(workspace.status,200)
 pass('当前 5174：新账号注册、自动登录、引导与受保护首页实际可用')
 await page.reload();await page.locator('.dashboard-grid').waitFor()
 pass('当前 5174：刷新后服务端会话保持')
 await page.goto(`${origin}/#/profile`);await page.locator('.profile__logout').click()
 await registration(account)
 await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click()
 await page.locator('[role=alert]').waitFor()
 const error=await page.locator('[role=alert]').innerText()
 assert.match(error,/账号.*(?:已存在|已注册|已经注册)/,'409 必须明确说明账号已注册，不能让用户稍后重试')
 pass('409 明确提示账号已注册，保留可修正的输入')
 assert.equal(await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).count(),0,'409 后主操作改为登录，不让用户反复提交注册')
 assert.equal(await page.getByLabel('账号',{exact:true}).inputValue(),account)
 assert.equal(await page.getByLabel('密码',{exact:true}).inputValue(),password)
 await page.screenshot({path:path.join(out,'registration-conflict.png'),fullPage:true})
 await page.getByRole('button',{name:'用此账号登录',exact:true}).click()
 await page.locator('.dashboard-grid').waitFor()
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/auth/session');return r.status}),200)
 pass('409 后点击用此账号登录，恢复同一账号受保护首页')
 await page.goto(`${origin}/#/profile`);await page.locator('.profile__logout').click()
 await registration(account)
 await page.getByLabel('密码',{exact:true}).fill(crypto.randomUUID())
 await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click()
 await page.getByRole('button',{name:'用此账号登录',exact:true}).click()
 await page.getByText('账号或密码错误',{exact:true}).waitFor()
 assert.equal(await page.locator('.dashboard-grid').count(),0)
 pass('409 的登录入口仍校验密码，错误密码不能进入账号')
 await registration('email@example.com')
 await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click()
 await page.getByText('账号格式不符合要求',{exact:true}).waitFor()
 assert.match(await page.locator('[role=alert]').innerText(),/3–64/)
 pass('账号格式错误明确说明可修改规则')
 await registration(`auth-recover-${Date.now()}`)
 await page.route('**/api/auth/login',route=>route.abort())
 await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click()
 await page.getByText('账号已创建，登录未完成',{exact:true}).waitFor()
 await page.getByRole('button',{name:'登录',exact:true}).waitFor()
 await page.unroute('**/api/auth/login')
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await page.locator('.today__hello').waitFor()
 await page.getByRole('dialog').waitFor()
 await page.getByRole('button',{name:'稍后再说',exact:true}).click()
 await page.locator('.dashboard-grid').waitFor()
 pass('注册成功但登录网络失败时明确告知已创建，重试登录不重复注册')
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({origin,checks,responses,pageErrors:errors},null,2))
 console.log(`${checks.length}/${checks.length} checks passed`)
}catch(error){
 await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{})
 fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({origin,checks,responses,pageErrors:errors,visibleText:await page.locator('body').innerText().catch(()=>''),failure:error.message},null,2))
 throw error
}finally{await browser.close()}
