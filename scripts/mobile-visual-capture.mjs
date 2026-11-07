import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {chromium} from '@playwright/test'

const label=process.argv[2]||'review',origin=process.env.EDUMIND_LIVE_URL||'http://127.0.0.1:5174'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid capture label')
const out=path.resolve('outputs/visual-refinement',label)
fs.mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'D:/cloakbrowser-windows-x64/chrome.exe',headless:true})
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
const page=await context.newPage(),errors=[],captures=[]
page.on('pageerror',e=>errors.push(e.message));context.setDefaultTimeout(15000)
try{
 await page.goto(`${origin}/?preview=visual-refinement#/login`)
 await page.getByRole('button',{name:'第一次来？创建学习账号',exact:true}).click()
 await page.getByLabel('昵称',{exact:true}).fill('林同学')
 await page.getByLabel('账号',{exact:true}).fill(`visual-${Date.now()}`)
 await page.getByLabel('密码',{exact:true}).fill(crypto.randomUUID())
 await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click()
 await page.getByRole('dialog').waitFor()
 await page.getByRole('button',{name:'稍后再说',exact:true}).click()
 await page.locator('.dashboard-grid').waitFor()
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:width===390?844:1000})
  for(const route of ['profile','today']){
   await page.goto(`${origin}/?preview=visual-refinement#/${route}`)
   await page.locator(route==='profile'?'.profile-learning-grid':'.dashboard-grid').waitFor()
   await page.evaluate(async()=>{await document.fonts.ready;scrollTo(0,0)})
   await page.screenshot({path:path.join(out,`${route}-${width}-viewport.png`),fullPage:false,animations:'disabled'});await page.screenshot({path:path.join(out,`${route}-${width}.png`),fullPage:true,animations:'disabled'})
   captures.push(await page.evaluate(()=>({url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,theme:document.documentElement.dataset.mobileTheme,bg:getComputedStyle(document.documentElement).getPropertyValue('--m-bg').trim(),accent:getComputedStyle(document.documentElement).getPropertyValue('--m-primary').trim(),font:getComputedStyle(document.querySelector('main')).fontFamily,headings:[...document.querySelectorAll('h1,h2,h3,.focus-duration')].slice(0,8).map(e=>({text:e.textContent,font:getComputedStyle(e).fontFamily})),navHeight:document.querySelector('.mobile-tabs>a')?.getBoundingClientRect().height})))
  }
 }
 fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({captures,errors,data:'Live API, fresh test account with no learning history'},null,2))
 if(errors.length)throw Error(errors.join('\n'))
 console.log(JSON.stringify({captures:captures.length,pageErrors:errors.length,out}))
}finally{await browser.close()}
