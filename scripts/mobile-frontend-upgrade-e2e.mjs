import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {defaultLocalConfig} from '../src/mobile/domain/companion.ts'
import {chromium} from '@playwright/test'
const root=process.cwd(),out=path.join(root,'outputs/frontend-upgrade/browser'),stamp=Date.now()
fs.mkdirSync(out,{recursive:true})
const runtime=path.join(out,`runtime-${stamp}`)
const api=spawn(process.execPath,['server/index.js'],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,PORT:'18898',ZHIXUE_ENV:'demo',MYSQL_URL:'',MYSQL_HOST:'',MYSQL_USER:'',MYSQL_DATABASE:'',LLM_API_KEY:'',ZHIXUE_DATA_FILE:`${runtime}.json`,ZHIXUE_CHAT_STORE_FILE:`${runtime}.chat.json`,ZHIXUE_SESSION_FILE:`${runtime}.sessions.json`,ZHIXUE_IDENTITY_FILE:`${runtime}.identities.json`,ZHIXUE_TRACE_FILE:`${runtime}.traces.json`}})
const web=spawn(process.execPath,['scripts/serve-mobile.mjs','5188','http://127.0.0.1:18898'],{cwd:root,windowsHide:true,stdio:'ignore'})
let browser,page
const checks=[],errors=[],pass=name=>{checks.push(name);console.log(`PASS ${name}`)}
try{
 for(const url of ['http://127.0.0.1:18898/api/health','http://127.0.0.1:5188/']){let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,150))}assert.ok(ready)}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'D:/cloakbrowser-windows-x64/chrome.exe',headless:true})
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});context.setDefaultTimeout(15000)
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const go=route=>page.goto(`http://127.0.0.1:5188/#/${route}`)
 const shot=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`${name}.png`),animations:'disabled',fullPage:true})}
 const get=url=>page.evaluate(async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${r.status}`);return r.json()},url)
 const local=async()=>(await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('edumind-mobile-ui-v2:'));return key?JSON.parse(localStorage.getItem(key)):null}))||defaultLocalConfig()
 const register=async account=>{await go('login');await page.getByRole('button',{name:'第一次来？创建学习账号',exact:true}).click();await page.getByLabel('昵称',{exact:true}).fill('星航体验者');await page.getByLabel('账号',{exact:true}).fill(account);await page.getByLabel('密码',{exact:true}).fill('Frontend-test-2026');await page.getByRole('button',{name:'创建账号并开始学习',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'稍后再说',exact:true}).click();await page.locator('.dashboard-grid').waitFor()}
 await register(`upgrade${stamp}a`)
 assert.equal(await page.locator('.mobile-tabs>a').count(),4)
 const slogan=await page.locator('.daily-slogan [data-daily-slogan]').innerText();await page.reload();await page.locator('.dashboard-grid').waitFor();assert.equal(await page.locator('.daily-slogan [data-daily-slogan]').innerText(),slogan)
 await shot('01-mobile-home');pass('四主导航与稳定每日标语，刷新不随机变化')
 await page.getByRole('button',{name:'定制首页面板',exact:true}).click();assert.equal(await page.locator('.mobile-shell').evaluate(e=>e.inert),true)
 await page.getByRole('dialog').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true)
 await page.getByLabel('让星枢帮我添加面板').fill('把最近错题和待复习知识点放在首页');await page.getByRole('button',{name:'生成安全面板预览',exact:true}).click()
 assert.equal((await local()).widgets.length,3);await page.getByRole('button',{name:'取消预览',exact:true}).click();assert.equal((await local()).widgets.length,3)
 await page.getByRole('button',{name:'生成安全面板预览',exact:true}).click();await page.getByRole('button',{name:'确认添加',exact:true}).click();assert.equal((await local()).widgets.length,4)
 await page.getByRole('button',{name:'上移错题与待复习',exact:true}).click();await page.getByRole('button',{name:'隐藏错题与待复习',exact:true}).click();await page.keyboard.press('Escape');await page.reload();await page.locator('.dashboard-grid').waitFor()
 assert.equal((await local()).widgets[2].kind,'review');assert.equal((await local()).widgets[2].visible,false)
 await page.getByRole('button',{name:'定制首页面板',exact:true}).click();await page.getByRole('button',{name:'恢复默认三个面板',exact:true}).click();await page.getByRole('button',{name:'确认恢复默认',exact:true}).click();await page.keyboard.press('Escape');assert.equal((await local()).widgets.length,3)
 pass('面板仅确认后写入，取消、排序、隐藏、刷新恢复与键盘弹窗正常')
 await go('focus');await page.getByRole('button',{name:'开始专注',exact:true}).click();await page.getByRole('button',{name:'暂停',exact:true}).waitFor();await page.waitForTimeout(1300);await page.getByRole('button',{name:'暂停',exact:true}).click();await page.reload();await page.getByRole('button',{name:'继续',exact:true}).waitFor();await page.getByRole('button',{name:'继续',exact:true}).click()
 await page.getByRole('link',{name:'返回上一层',exact:true}).click();await page.getByRole('dialog',{name:'要离开专注页吗？'}).waitFor();await page.getByRole('button',{name:'继续专注',exact:true}).click();await page.getByRole('button',{name:'重置这一段',exact:false}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await page.getByRole('button',{name:'结束并保存',exact:true}).click();await page.locator('.focus-summary').waitFor()
 assert.ok((await get('/api/workspace')).focus[0].accumulatedSeconds>=1);assert.equal((await local()).food,0);await shot('02-focus-summary');await page.getByRole('button',{name:'开始专注',exact:true}).click();await page.getByRole('button',{name:'重置这一段',exact:false}).click();await page.getByRole('button',{name:'结束并重置',exact:true}).click();await page.getByRole('button',{name:'开始专注',exact:true}).waitFor();assert.equal((await get('/api/workspace')).focus.length,2)
 pass('计时可暂停、继续、冷启动恢复、退出确认；提前结束保存真实秒数且不发奖励')
 await go('library');if(!(await page.locator('.vault-importer').evaluate(e=>e.open)))await page.locator('.vault-importer>summary').click();await page.locator('.vault-file-pickers input[type=file]').first().setInputFiles([{name:'向量.md',mimeType:'text/markdown',buffer:Buffer.from('---\ntitle: 向量入门\ntags: [数学, 线代]\n---\n# 向量\n[[映射]]\n向量空间的定义与例子。')},{name:'映射.md',mimeType:'text/markdown',buffer:Buffer.from('# 映射\n[[向量]]\n线性映射保持加法与数乘。')}])
 await page.locator('.vault-preview').waitFor();assert.equal((await get('/api/workspace')).materials.length,0)
 await page.getByRole('button',{name:'预览无误，确认导入',exact:true}).click();await page.getByRole('button',{name:'确认保存到我的资料库',exact:true}).click();await page.waitForFunction(async()=>((await(await fetch('/api/workspace')).json()).materials.length===2));await page.getByRole('dialog').waitFor({state:'hidden'})
 await go('atlas');await page.locator('.knowledge-node').first().waitFor();assert.equal(await page.locator('.knowledge-node').count(),2);await page.locator('.graph-node-list button').filter({hasText:'映射'}).click();await page.locator('.constellation-selected').waitFor();assert.match(await page.locator('.constellation-selected').innerText(),/向量入门/)
 await page.getByRole('button',{name:'放大知识图谱',exact:true}).click();assert.match(await page.locator('.graph-controls').innerText(),/115%/)
 await page.getByLabel('搜索知识节点').fill('映射');assert.equal(await page.locator('.knowledge-node').count(),1);await page.getByLabel('搜索知识节点').fill('');await shot('03-knowledge-network')
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出原始 Markdown',exact:false}).click();assert.equal((await download).suggestedFilename(),'映射.md')
 await page.getByRole('link',{name:'学习轨迹',exact:true}).click();assert.equal(await page.locator('.knowledge-graph').count(),0)
 await page.getByRole('link',{name:'能力图谱',exact:true}).click();assert.equal(await page.locator('.knowledge-graph').count(),0);assert.match(await page.locator('main').innerText(),/证据|测评|练习/)
 pass('Markdown 先预览后保存，双链与反链可选、图谱可搜索缩放导出，三种星图区分明确')
 await go('library');if(!(await page.locator('.vault-importer').evaluate(e=>e.open)))await page.locator('.vault-importer>summary').click();await page.locator('.vault-file-pickers input[type=file]').first().setInputFiles({name:'向量.md',mimeType:'text/markdown',buffer:Buffer.from('# 更新的向量')});await page.getByLabel('遇到重复文件时').selectOption('skip');await page.getByRole('button',{name:'预览无误，确认导入',exact:true}).click();await page.getByRole('button',{name:'确认保存到我的资料库',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await get('/api/workspace')).materials.length,2)
 const reimport=async strategy=>{await go('library');if(!(await page.locator('.vault-importer').evaluate(e=>e.open)))await page.locator('.vault-importer>summary').click();await page.locator('.vault-file-pickers input[type=file]').first().setInputFiles({name:'向量.md',mimeType:'text/markdown',buffer:Buffer.from('# 更新的向量\n[[映射]]\n这是用户确认的新原文。')});await page.getByLabel('遇到重复文件时').selectOption(strategy);await page.getByRole('button',{name:'预览无误，确认导入',exact:true}).click();await page.getByRole('button',{name:'确认保存到我的资料库',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})}
 await reimport('overwrite');assert.equal((await get('/api/workspace')).materials.length,2);assert.match(JSON.stringify((await get('/api/workspace')).materials),/用户确认的新原文/)
 await reimport('copy');assert.equal((await get('/api/workspace')).materials.length,3)
 pass('同路径重复文件预览支持跳过、确认覆盖与保留副本')
 await go('agent');await page.getByLabel('你想完成什么？').fill('帮我安排今天的资料复习任务');await page.getByRole('button',{name:'预览任务步骤',exact:true}).click();await page.getByRole('button',{name:'确认并开始',exact:true}).click();await page.locator('[data-task-status=completed]').waitFor({timeout:60000})
 await go('learn');await page.getByRole('button',{name:'确认已完成',exact:true}).first().waitFor();
 const w=await get('/api/workspace');assert.ok(w.tasks[0].checklist.length)
 const firstTask=page.locator('.learning-task-card').first();await firstTask.getByRole('button',{name:'确认已完成',exact:true}).click();await firstTask.getByRole('button',{name:'撤销完成标记',exact:true}).click();await firstTask.getByRole('button',{name:'确认已完成',exact:true}).click();
 await go('pet');await page.getByRole('button',{name:'喂一份星粮',exact:true}).waitFor();await page.waitForFunction(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('edumind-mobile-ui-v2:'));return k&&JSON.parse(localStorage.getItem(k)).food===1})
 await page.reload();await page.getByRole('button',{name:'喂一份星粮',exact:true}).click();assert.equal((await local()).food,0);assert.equal((await local()).experience,10);await page.reload();await page.locator('.pet-layout').waitFor();assert.equal((await local()).food,0)
 await page.getByRole('button',{name:'月影猫',exact:false}).click();await page.reload();await page.locator('.pet-layout').waitFor();assert.equal((await local()).pet,'cat');await shot('04-pet')
 pass('服务器已保存清单产生一次奖励，刷新不重领，喂养不透支且宠物选择恢复')
 await go('self-test');await page.getByLabel('题型',{exact:false}).selectOption('multi');await page.getByLabel('根据资料提出问题').fill('哪些陈述需要结合原文核对？');await page.getByLabel('选项（每行一项，2–8 项）').fill('定义\n前置条件\n符号');await page.getByLabel('核对依据与解析（建议填写原文段落）').fill('回到原文逐项检查。');await page.getByRole('button',{name:'保存草稿并开始自测',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'保存作答，查看核对依据',exact:true}).click();await page.getByLabel('核对后的自我判断').selectOption('review');await page.reload();await page.getByLabel('核对后的自我判断').waitFor();assert.equal(await page.getByLabel('核对后的自我判断').inputValue(),'review');assert.equal((await local()).food,0)
 pass('本地多选自测作答与人工核对可恢复，不写入成绩、不发学习奖励')
 for(const width of [320,390,430,1280,1440]){await page.setViewportSize({width,height:900});for(const route of ['today','learn','atlas','profile','pet','self-test','library']){await go(route);await page.locator('main>section').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${route} ${width}`)}if(width>=1280){await go('today');await page.locator('.dashboard-grid').waitFor();assert.ok((await page.locator('.mobile-body').boundingBox()).width>850);await shot(`05-desktop-${width}`)}}
 await go('profile');for(const label of ['本日','本月','本周']){await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')}await page.locator('.profile-appearance summary').click();await page.getByRole('button',{name:'浅色',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.mobileTheme),'light');await page.reload();await page.locator('.profile-learning-grid').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.mobileTheme),'light');await shot('06-profile-light')
 pass('五种手机及桌面宽度无页面溢出；侧栏扩展、日周月统计和主题持久化正常')
 await page.locator('.profile__logout').click();await register(`upgrade${stamp}b`)
 await go('pet');await page.locator('.pet-layout').waitFor();assert.match(await page.locator('.pet-feed').innerText(),/0\s*份星粮/);assert.match(await page.locator('.pet-showcase').innerText(),/星航狐/);assert.equal((await get('/api/workspace')).materials.length,0)
 pass('第二真实账号没有第一个账号的资料、宠物选择、星粮与成长记录')
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,pageErrors:errors},null,2));console.log(`${checks.length}/${checks.length} checks passed`)
}catch(e){if(page&&!page.isClosed()){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''))}throw e}finally{await browser?.close();api.kill();web.kill()}
