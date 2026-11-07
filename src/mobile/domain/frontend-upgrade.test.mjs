import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultLocalConfig,storageScope,validateWidget,proposeWidget,grantEvidence,feedPet,readLocalConfig,dailySlogan,shanghaiDay,timeBuckets,petProgress} from './companion.ts'
import {parseMarkdown,resolveVaultLinks,normalizeVaultPath} from './markdown-vault.ts'
test('面板只允许白名单类型与固定 Schema，不能携带可执行代码',()=>{
 const p=proposeWidget('把最近错题和待复习知识点放在首页').widget
 assert.equal(p.kind,'review');assert.equal(validateWidget(p),true)
 for(const patch of [{kind:'script'},{code:'alert(1)'},{title:''},{id:''},{kind:'__proto__'}])assert.equal(validateWidget({...p,...patch}),false)
})
test('每日标语稳定，刷新偏移可恢复；上海日期边界准确',()=>{
 assert.equal(dailySlogan('2026-10-26'),dailySlogan('2026-10-26'))
 assert.notEqual(dailySlogan('2026-10-26'),dailySlogan('2026-10-26',1))
 assert.equal(shanghaiDay(Date.parse('2026-10-25T16:00:00Z')),'2026-10-26')
})
test('真实完成奖励按证据 ID 去重，刷新与反复勾选不重复领',()=>{
 let c=defaultLocalConfig();const event={id:'completed-session',type:'practice',at:'2026-10-26T01:00:00Z'}
 assert.equal(grantEvidence(c,event),true);assert.equal(grantEvidence(c,event),false);assert.equal(c.food,2)
 c=readLocalConfig(JSON.stringify(c));assert.equal(grantEvidence(c,event),false)
 assert.equal(grantEvidence(c,{id:'item',type:'task',at:event.at,confirmedDone:false}),false)
 assert.equal(grantEvidence(c,{id:'item',type:'task',at:event.at,confirmedDone:true}),true)
 assert.equal(grantEvidence(c,{id:'item',type:'task',at:event.at,confirmedDone:true}),false)
 assert.equal(c.food,3)
})
test('无效时间、提前结束与缺失计划时长不发专注奖励',()=>{
 const c=defaultLocalConfig(),base={type:'focus',at:'2026-10-26T01:00:00Z',expectedSeconds:1500}
 for(const seconds of [0,1,59,1199])assert.equal(grantEvidence(c,{...base,id:String(seconds),seconds}),false)
 assert.equal(grantEvidence(c,{...base,id:'missing',seconds:1200,expectedSeconds:undefined}),false)
 assert.equal(grantEvidence(c,{...base,id:'valid',seconds:1200}),true);assert.equal(c.food,3)
 assert.equal(grantEvidence(c,{id:'bad',type:'practice',at:'invalid'}),false)
})
test('喂养不透支，经验和阶段恢复；账号与来源隔离',()=>{
 const c=defaultLocalConfig();assert.equal(feedPet(c),false);c.food=1
 assert.equal(feedPet(c),true);assert.equal(feedPet(c),false);assert.equal(c.experience,10)
 assert.equal(readLocalConfig(JSON.stringify(c)).experience,10);assert.equal(petProgress(100).stage,'同行');assert.equal(petProgress(250).stage,'领航')
 assert.notEqual(storageScope('https://a','user'),storageScope('https://b','user'));assert.notEqual(storageScope('https://a','user'),storageScope('https://a','other'))
})
test('损坏本机配置安全回退，禁止原型键并限制格式',()=>{
 const c=readLocalConfig('{"version":1,"widgets":[{"code":"x"}],"uncertain":{"__proto__":true,"a":true,"b":"yes"},"food":-1}')
 assert.equal(c.widgets.length,3);assert.equal(c.food,0);assert.equal(c.uncertain.a,true);assert.equal(c.uncertain.b,undefined);assert.equal(Object.hasOwn(c.uncertain,'__proto__'),false)
 assert.deepEqual(readLocalConfig('broken'),defaultLocalConfig())
})
test('浅色外观升级保留学习与宠物配置，新版主动选择的深色刷新后保留',()=>{
 const old=defaultLocalConfig();delete old.appearanceRevision;old.theme='dark';old.pet='cat';old.food=3;old.experience=20;old.favorites=['学过之后，再试着回忆一次。']
 const migrated=readLocalConfig(JSON.stringify(old))
 assert.equal(migrated.theme,'light');assert.equal(migrated.appearanceRevision,2)
 assert.equal(migrated.pet,'cat');assert.equal(migrated.food,3);assert.equal(migrated.experience,20);assert.deepEqual(migrated.widgets,old.widgets);assert.deepEqual(migrated.favorites,old.favorites)
 migrated.theme='dark';assert.equal(readLocalConfig(JSON.stringify(migrated)).theme,'dark')
})
test('计时统计按真实结束日聚合，目标归属保留且不生成虚构时间',()=>{
 const records=[{id:'a',at:'2026-10-25T16:01:00Z',seconds:61,goalId:'g'}]
 const result=timeBuckets(records,2,Date.parse('2026-10-26T02:00:00Z'))
 assert.deepEqual(result,[{day:'2026-10-25',seconds:0},{day:'2026-10-26',seconds:61}])
})
test('Markdown 保留原文、标题、标签、Frontmatter、目录及双向关系',()=>{
 const raw='---\ntitle: 向量入门\ntags:\n - 数学\n - 线代\n---\n# 向量空间\n[[映射|相关概念]]\n[定义](../概念/映射.md) #复习\n'
 const a=parseMarkdown('课程/向量.md',raw),b=parseMarkdown('概念/映射.md','# 映射\n[[向量]]')
 assert.equal(a.raw,raw);assert.equal(a.title,'向量入门');assert.deepEqual(a.tags,['数学','线代','复习']);assert.deepEqual(a.headings,['向量空间'])
 const links=resolveVaultLinks([a,b]);assert.equal(links.edges.length,2);assert.deepEqual(links.backlinks(b.path),[a.path]);assert.equal(links.unresolved.length,0)
})
test('同名歧义不虚构链接；越界路径拒绝；MDX 按纯文本保留',()=>{
 const a=parseMarkdown('a.md','# a\n[[同名]]\n[[未导入]]'),b=parseMarkdown('甲/同名.md','# b'),c=parseMarkdown('乙/同名.md','# c')
 assert.equal(resolveVaultLinks([a,b,c]).edges.length,0);assert.equal(resolveVaultLinks([a,b,c]).unresolved.length,2)
 assert.equal(normalizeVaultPath('../../secret.md'),null);assert.throws(()=>parseMarkdown('bad.exe','text'))
 const raw='# MDX\n<script>alert(1)</script>';assert.equal(parseMarkdown('safe.mdx',raw).raw,raw)
})
