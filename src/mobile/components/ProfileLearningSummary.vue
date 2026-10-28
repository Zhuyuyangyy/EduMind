<template>
  <div class="profile-learning-grid">
    <section class="profile-records" aria-labelledby="profile-records-title">
      <header class="profile-records-header">
        <h2 id="profile-records-title">学习记录</h2>
        <div class="profile-periods" aria-label="学习时长范围"><button v-for="item in periods" :key="item.key" :aria-pressed="period === item.key" @click="period = item.key">{{ item.label }}</button></div>
      </header>
      <div v-if="store.loading && !store.loaded" class="m-skeleton m-skeleton--block" aria-label="正在读取学习记录" /><p v-else-if="store.error" class="m-error" role="alert">{{ store.error }} <button class="workspace-text-action" @click="store.refresh">重试</button></p>
      <template v-else>
        <div class="profile-stat-line"><div class="profile-primary-stat"><strong>{{ Math.floor(total / 60) }}</strong><span>专注分钟</span></div><div><strong>{{ activeDays }}</strong><span>学习天数</span></div><div><strong>{{ doneTasks }}</strong><span>确认完成</span></div></div>
        <StudyTimeChart v-if="total > 0" :buckets="buckets" />
        <RouterLink v-else to="/focus" class="profile-first-session"><span class="profile-empty-mark"><Clock3 :size="19" /></span><span>给今天留一段专注时间<small>完成后，你的学习记录会出现在这里</small></span><ArrowUpRight :size="18" /></RouterLink>
        <details class="profile-data-note"><summary>记录说明<span>{{ buckets[0]?.day.slice(5).replace('-', '/') }} — {{ buckets[buckets.length - 1]?.day.slice(5).replace('-', '/') }}</span></summary><p>统计服务器已结束的计时，按 UTC+8 日期归档。任务数为本期手动确认完成的清单，不代表能力测评。</p><div v-for="row in distribution" :key="row.id" class="profile-distribution"><span>{{ row.title }}</span><b>{{ Math.floor(row.seconds / 60) }} 分 {{ row.seconds % 60 }} 秒</b></div></details>
      </template>
    </section>
    <RouterLink to="/pet" class="profile-companion"><span class="profile-companion-art"><AIPetAvatar :kind="store.local.pet" :stage="store.pet.stage" :animated="false" /></span><span class="profile-companion-body"><span class="profile-companion-label">你的学习伙伴</span><strong>{{ petNames[store.local.pet] }}<span>Lv.{{ store.pet.level }}</span></strong><small>{{ store.local.food }} 份星粮 · {{ store.pet.stage }}阶段</small></span><ChevronRight :size="18" /></RouterLink>
    <details class="profile-appearance"><summary><span><Palette :size="18" />外观、语言与收藏</span><ChevronDown :size="16" /></summary><div class="profile-periods"><button :aria-pressed="store.local.theme === 'light'" @click="theme('light')">浅色</button><button :aria-pressed="store.local.theme === 'dark'" @click="theme('dark')">深色</button></div><p class="workspace-caption">简体中文 · 外观与标语收藏保存在本机。</p><ul v-if="store.local.favorites.length"><li v-for="item in store.local.favorites" :key="item">{{ item }} <button class="workspace-text-action" @click="remove(item)">取消收藏</button></li></ul><p v-else class="workspace-caption">在首页收藏喜欢的每日标语。</p><p v-if="store.storageError" role="alert">{{ store.storageError }}</p></details>
  </div>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { ArrowUpRight, ChevronDown, ChevronRight, Clock3, Palette } from 'lucide-vue-next'
import { useLearningWorkspace } from '@/mobile/stores/learning-workspace'
import { shanghaiDay, timeBuckets } from '@/mobile/domain/companion'
import AIPetAvatar from './AIPetAvatar.vue'
const StudyTimeChart = defineAsyncComponent(() => import('./StudyTimeChart.vue'))
const store = useLearningWorkspace(), period = ref('week')
const petNames = { fox: '星航狐', cat: '月影猫', rabbit: '云朵兔', owl: '夜航鸮' }
const periods = [{ key: 'day', label: '本日' }, { key: 'week', label: '本周' }, { key: 'month', label: '本月' }]
const days = computed(() => { const day = shanghaiDay(); return period.value === 'day' ? 1 : period.value === 'month' ? Number(day.slice(-2)) : ((new Date(`${day}T12:00:00+08:00`).getUTCDay() + 6) % 7) + 1 })
const buckets = computed(() => timeBuckets(store.timeRecords, days.value)), start = computed(() => buckets.value[0]?.day || shanghaiDay())
const inRange = (at: string) => shanghaiDay(Date.parse(at)) >= start.value && shanghaiDay(Date.parse(at)) <= shanghaiDay()
const total = computed(() => buckets.value.reduce((sum, b) => sum + b.seconds, 0)), activeDays = computed(() => buckets.value.filter(b => b.seconds > 0).length)
const doneTasks = computed(() => store.taskItems.filter(t => t.done && t.updatedAt && inRange(t.updatedAt)).length)
const distribution = computed(() => { const map = new Map<string, number>(); for (const record of store.timeRecords.filter(r => inRange(r.at))) map.set(record.goalId || '', (map.get(record.goalId || '') || 0) + record.seconds); return [...map].map(([id, seconds]) => ({ id, seconds, title: store.workspace?.goals.find(g => g.id === id)?.title || (id ? '原目标已不可用' : '未关联目标') })) })
function theme(value: 'dark' | 'light') { store.local.theme = value; store.persist() }
function remove(item: string) { store.local.favorites = store.local.favorites.filter(s => s !== item); store.persist() }
</script>
<style scoped>
.profile-learning-grid{display:grid;gap:14px;margin:24px 0 28px;align-items:start}
.profile-records,.profile-companion,.profile-appearance{border:1px solid var(--m-border);border-radius:20px;background:var(--m-surface)}
.profile-records{padding:20px}.profile-records-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.profile-records h2{font-size:16px;letter-spacing:-.3px;margin:0;font-weight:600}
.profile-periods{display:flex;padding:3px;border-radius:10px;background:var(--m-surface-2);gap:2px}.profile-periods button{border:0;border-radius:7px;min-height:44px;padding:0 11px;color:var(--m-text-faint);background:none;font:inherit;font-size:12px;cursor:pointer}.profile-periods button[aria-pressed=true]{background:var(--m-surface);color:var(--m-text);box-shadow:0 1px 4px rgba(20,28,45,.09)}
.profile-stat-line{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:16px;padding:26px 0 22px;align-items:end}.profile-stat-line>div{display:grid;gap:8px}.profile-stat-line strong{font-size:28px;font-weight:550;line-height:1;letter-spacing:-1px;font-variant-numeric:tabular-nums}.profile-stat-line .profile-primary-stat strong{font-size:46px;letter-spacing:-2px}.profile-stat-line span{font-size:12px;color:var(--m-text-faint)}
.profile-first-session{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--m-text-dim);padding:14px 0;border-top:1px solid var(--m-border);font-size:13px;line-height:1.5}.profile-empty-mark{display:grid;place-items:center;width:36px;height:36px;background:var(--m-primary-soft);border-radius:12px;color:var(--m-primary);flex:none}.profile-first-session>span:nth-child(2){flex:1}.profile-first-session small{display:block;color:var(--m-text-faint);font-size:11px;margin-top:4px}.profile-first-session>svg{color:var(--m-primary);flex:none}
.profile-data-note{border-top:1px solid var(--m-border);font-size:11px;color:var(--m-text-faint)}.profile-data-note summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:38px;cursor:pointer;list-style:none}.profile-data-note p{line-height:1.8;margin:8px 0}.profile-distribution{display:flex;justify-content:space-between;gap:12px;margin:12px 0}.profile-distribution b{font-weight:500}
.profile-companion{display:flex;align-items:center;gap:12px;padding:12px 18px 12px 10px;text-decoration:none;color:var(--m-text);min-height:112px}.profile-companion-art{width:88px;flex:none;display:block}.profile-companion .ai-pet-avatar{width:100%;display:block}.profile-companion-body{display:grid;gap:6px;flex:1}.profile-companion-label{font-size:11px;color:var(--m-text-faint)}.profile-companion-body strong{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:600}.profile-companion-body strong>span{font-size:11px;font-weight:500;color:var(--m-primary);background:var(--m-primary-soft);padding:2px 6px;border-radius:5px}.profile-companion-body small{font-size:12px;color:var(--m-text-dim)}.profile-companion>svg{color:var(--m-text-faint)}
.profile-appearance{padding:0 18px;font-size:13px}.profile-appearance>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:54px;cursor:pointer;list-style:none;color:var(--m-text-dim)}.profile-appearance summary>span{display:flex;align-items:center;gap:10px}.profile-appearance .profile-periods{margin-bottom:14px}.profile-appearance .profile-periods button{flex:1;min-height:42px}.profile-appearance[open]{padding-bottom:16px}.profile-appearance li{font-size:13px;line-height:1.8;margin:12px 0}.profile-appearance ul{padding-left:18px}
@media(min-width:1050px){.profile-learning-grid{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);grid-template-areas:'records pet' 'records appearance';gap:16px}.profile-records{grid-area:records}.profile-companion{grid-area:pet}.profile-appearance{grid-area:appearance}}
@media(max-width:359px){.profile-records{padding:17px}.profile-periods button{padding:0 9px}.profile-stat-line{gap:12px}}
</style>
