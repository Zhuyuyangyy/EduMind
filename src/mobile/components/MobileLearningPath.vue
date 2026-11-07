<template>
  <div class="learning-path">
    <article v-for="(phase, index) in path.phases" :key="phase.id" class="learning-path__stage" :class="{ 'learning-path__stage--open': selected === phase.id }">
      <button class="learning-path__head" :aria-expanded="selected === phase.id" :aria-controls="`${uid}-${index}`" @click="selected = selected === phase.id ? null : phase.id">
        <span class="learning-path__number">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="learning-path__title"><strong>{{ phase.name }}</strong><small>{{ phase.topics?.length || 0 }} 个知识点<span v-if="phase.topics?.some(topic => topic.recommended)"> · 含推荐主题</span></small></span>
        <MobileIcon name="chevronRight" :size="17" class="learning-path__chevron" />
      </button>
      <div v-show="selected === phase.id" :id="`${uid}-${index}`" class="learning-path__topics">
        <div v-for="topic in phase.topics || []" :key="topic.id" class="learning-path__topic">
          <div class="learning-path__topic-heading"><span>{{ topic.name }}</span><span class="learning-path__mastery">{{ masteryLabel(topic.mastery).text }}</span></div>
          <div class="m-progress"><div class="m-progress__fill" :style="{ width: `${Math.max(0, Math.min(100, topic.mastery * 100))}%` }" /></div>
          <RouterLink :to="{ path: '/tutor', query: { topic: topic.id, name: topic.name } }" class="learning-path__action">学习这个知识点 <MobileIcon name="chevronRight" :size="13" /></RouterLink>
        </div>
        <p v-if="!phase.topics?.length" class="learning-path__empty">这个阶段暂未添加知识点。</p>
        <p class="learning-path__note">掌握度为路径估计，供学习规划参考。</p>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import { masteryLabel } from '@/mobile/data/learning-data'
import type { KnowledgePath } from '@/mobile/data/types'
import MobileIcon from './MobileIcon.vue'
const props = defineProps<{ path: KnowledgePath; initialPhase?: string }>()
const route = useRoute()
const uid = useId()
const selected = ref<string | null>(null)
watch(() => [props.path, props.initialPhase, route.query.phase] as const, () => {
  const requested = typeof route.query.phase === 'string' ? route.query.phase : props.initialPhase
  selected.value = props.path.phases.find(phase => phase.id === requested)?.id
    || props.path.phases.find(phase => phase.topics?.some(topic => topic.recommended))?.id
    || props.path.phases[0]?.id || null
}, { immediate: true })
</script>

<style scoped>
.learning-path { display: grid; gap: 10px; }
.learning-path__stage { border: 1px solid var(--m-border); border-radius: 20px; background: var(--m-surface); overflow: hidden; transition: border-color var(--m-duration); }
.learning-path__stage--open { border-color: var(--m-primary-border); box-shadow: var(--m-shadow-card); }
.learning-path__head { display: flex; align-items: center; gap: 14px; padding: 18px; width: 100%; min-height: 78px; border: 0; background: transparent; color: var(--m-text); text-align: left; cursor: pointer; font: inherit; }
.learning-path__number { display: grid; place-items: center; width: 38px; height: 42px; flex: none; border-radius: 12px; background: var(--m-surface-2); color: var(--m-text-faint); font-size: 14px; font-weight: 600; }
.learning-path__stage--open .learning-path__number { background: var(--m-primary-soft); color: var(--m-primary); }
.learning-path__title { display: grid; gap: 4px; flex: 1; min-width: 0; }
.learning-path__title strong { font-size: 15px; font-weight: 600; }
.learning-path__title small { color: var(--m-text-faint); font-size: 12px; }
.learning-path__chevron { flex: none; color: var(--m-text-faint); transition: transform var(--m-duration); }
.learning-path__stage--open .learning-path__chevron { transform: rotate(90deg); color: var(--m-primary); }
.learning-path__topics { padding: 0 18px 16px 70px; }
.learning-path__topic { padding: 14px 0; border-top: 1px solid var(--m-border); }
.learning-path__topic-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 13px; margin-bottom: 10px; }
.learning-path__mastery { color: var(--m-text-faint); font-size: 12px; }
.learning-path__action { display: inline-flex; gap: 5px; align-items: center; min-height: 44px; color: var(--m-primary); font-size: 12px; text-decoration: none; }
.learning-path__note, .learning-path__empty { margin: 2px 0 0; font-size: 12px; color: var(--m-text-faint); }
@media (max-width: 359px) { .learning-path__topics { padding-left: 20px; } }
</style>
