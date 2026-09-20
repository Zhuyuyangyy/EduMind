<template>
  <article
    v-if="viewMode === 'list'"
    @click="emit('cardClick', resource.id)"
    class="edu-resource-card edu-resource-card--list group"
  >
    <div class="edu-resource-card__media edu-resource-card__media--list">
      <iframe
        v-if="isVideo && resource.bilibiliBvid"
        :src="bilibiliPreviewUrl"
        class="edu-resource-card__iframe"
        title="Bilibili 视频预览"
        loading="lazy"
        sandbox="allow-same-origin allow-forms allow-scripts"
      />
      <div v-else class="edu-resource-card__cover" :class="coverClass">
        <component :is="categoryStyle.icon" class="edu-resource-card__cover-icon" />
        <span class="edu-resource-card__cover-kicker">{{ coverKicker }}</span>
        <strong>{{ coverTitle }}</strong>
        <p>{{ visualExcerpt }}</p>
      </div>

      <div v-if="isVideo" class="edu-resource-card__play">
        <Play class="w-3.5 h-3.5 fill-current" />
      </div>
      <div class="edu-resource-card__duration">{{ resource.estimatedTime || '15分钟' }}</div>
    </div>

    <div class="edu-resource-card__list-body">
      <div class="edu-resource-card__headline">
        <span class="edu-resource-card__category">
          <component :is="categoryStyle.icon" class="w-3.5 h-3.5" />
          {{ resource.category }}
        </span>
        <span class="edu-resource-card__level">{{ resource.difficulty }}</span>
      </div>

      <h4 :title="resource.title">{{ resource.title }}</h4>
      <p :title="resource.description">{{ resource.description }}</p>

      <div class="edu-resource-card__tags">
        <span v-for="(tag, idx) in visibleTags" :key="idx">{{ tag }}</span>
      </div>
    </div>

    <div class="edu-resource-card__metrics">
      <div>
        <Eye class="w-3 h-3" />
        <span>{{ formattedViews }}</span>
      </div>
      <div>
        <MessageSquare class="w-3 h-3" />
        <span>{{ danmakuCount }}</span>
      </div>
      <span>{{ resource.date }}</span>
    </div>

    <div class="edu-resource-card__actions" @click.stop>
      <button
        @click="emit('toggleStar', resource.id)"
        class="edu-resource-card__icon-btn"
        title="加入我的收藏"
      >
        <Star :class="['w-4 h-4', resource.starred ? 'text-[#fadb14] fill-[#fadb14]' : '']" />
      </button>

      <div class="relative" ref="dropdownRef">
        <button
          @click="showOptions = !showOptions"
          class="edu-resource-card__icon-btn"
          title="更多操作"
        >
          <MoreVertical class="w-4 h-4" />
        </button>
        <div v-if="showOptions" class="edu-resource-card__menu">
          <button @click="handleMarkCompleted" class="edu-resource-card__menu-item edu-resource-card__menu-item--done">
            <CheckCircle class="w-3.5 h-3.5" />
            <span>标记学完 (+{{ simulatedHours }}h)</span>
          </button>
          <button @click="handleToggleStarFromMenu" class="edu-resource-card__menu-item">
            <Star class="w-3.5 h-3.5 text-amber-500" />
            <span>{{ resource.starred ? '取消收藏' : '加入收藏' }}</span>
          </button>
          <button @click="handleCardClickFromMenu" class="edu-resource-card__menu-item edu-resource-card__menu-item--open">
            <BookOpen class="w-3.5 h-3.5" />
            <span>{{ isVideo ? '进入播放页' : '打开图文笔记' }}</span>
          </button>
        </div>
      </div>
    </div>
  </article>

  <article
    v-else
    @click="emit('cardClick', resource.id)"
    class="edu-resource-card edu-resource-card--grid group"
  >
    <div class="edu-resource-card__media">
      <iframe
        v-if="isVideo && resource.bilibiliBvid"
        :src="bilibiliPreviewUrl"
        class="edu-resource-card__iframe"
        title="Bilibili 视频预览"
        loading="lazy"
        sandbox="allow-same-origin allow-forms allow-scripts"
      />
      <div v-else class="edu-resource-card__cover" :class="coverClass">
        <span class="edu-resource-card__cover-kicker">{{ coverKicker }}</span>
        <component :is="categoryStyle.icon" class="edu-resource-card__cover-icon" />
        <strong>{{ coverTitle }}</strong>
        <p>{{ visualExcerpt }}</p>
        <div v-if="isDocLike" class="edu-resource-card__note-lines">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div class="edu-resource-card__media-shade"></div>
      <div v-if="isVideo" class="edu-resource-card__play edu-resource-card__play--large">
        <Play class="w-5 h-5 fill-current" />
      </div>
      <div class="edu-resource-card__duration">{{ resource.estimatedTime || '15分钟' }}</div>
      <div class="edu-resource-card__media-meta">
        <span>
          <PlaySquare class="w-3 h-3" />
          {{ formattedViews }}
        </span>
        <span>
          <MessageSquare class="w-3 h-3" />
          {{ danmakuCount }}
        </span>
      </div>
    </div>

    <div class="edu-resource-card__content">
      <div class="edu-resource-card__headline">
        <span class="edu-resource-card__category">
          <component :is="categoryStyle.icon" class="w-3.5 h-3.5" />
          {{ resource.category }}
        </span>
        <span class="edu-resource-card__level">{{ resource.difficulty }}</span>
      </div>

      <h4 :title="resource.title">{{ resource.title }}</h4>
      <p :title="resource.description">{{ resource.description }}</p>

      <div class="edu-resource-card__tags">
        <span v-for="(tag, idx) in visibleTags" :key="idx">{{ tag }}</span>
      </div>
    </div>

    <footer class="edu-resource-card__footer">
      <div class="edu-resource-card__author">
        <span class="edu-resource-card__avatar">{{ authorInitial }}</span>
        <span>{{ resource.author || '智学星枢教研组' }}</span>
        <span>·</span>
        <span>{{ resource.date }}</span>
      </div>
      <button
        @click.stop="emit('toggleStar', resource.id)"
        class="edu-resource-card__icon-btn"
        title="加入我的收藏"
      >
        <Star :class="['w-4 h-4', resource.starred ? 'text-[#fadb14] fill-[#fadb14]' : '']" />
      </button>
    </footer>

    <div class="edu-resource-card__more" @click.stop>
      <div class="relative" ref="dropdownRef">
        <button
          @click="showOptions = !showOptions"
          class="edu-resource-card__icon-btn"
          title="更多操作"
        >
          <MoreVertical class="w-3.5 h-3.5" />
        </button>
        <div v-if="showOptions" class="edu-resource-card__menu">
          <button @click="handleMarkCompleted" class="edu-resource-card__menu-item edu-resource-card__menu-item--done">
            <CheckCircle class="w-3.5 h-3.5" />
            <span>标记学完 (+{{ simulatedHours }}h)</span>
          </button>
          <button @click="handleToggleStarFromMenu" class="edu-resource-card__menu-item">
            <Star class="w-3.5 h-3.5 text-amber-500" />
            <span>{{ resource.starred ? '取消收藏' : '加入收藏' }}</span>
          </button>
          <button @click="handleCardClickFromMenu" class="edu-resource-card__menu-item edu-resource-card__menu-item--open">
            <BookOpen class="w-3.5 h-3.5" />
            <span>{{ isVideo ? '进入播放页' : '打开图文笔记' }}</span>
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type Component } from 'vue'
import {
  Star,
  Eye,
  MoreVertical,
  FileText,
  Video,
  HelpCircle,
  Code,
  Network,
  CheckCircle,
  BookOpen,
  Play,
  PlaySquare,
  MessageSquare,
} from 'lucide-vue-next'
import { type Resource, type ResourceCategory } from '../../types/edu-mind'

const props = defineProps<{
  resource: Resource
  viewMode: 'grid' | 'list'
}>()

const emit = defineEmits<{
  toggleStar: [id: string]
  cardClick: [id: string]
  markAsCompleted: [hours: number, title: string]
}>()

const showOptions = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

function getCategoryStyles(category: ResourceCategory): { icon: Component } {
  switch (category) {
    case '文档': return { icon: FileText }
    case '思维导图': return { icon: Network }
    case '流程图': return { icon: Network }
    case '习题': return { icon: HelpCircle }
    case '视频': return { icon: Video }
    case '代码': return { icon: Code }
    default: return { icon: FileText }
  }
}

const categoryStyle = computed(() => getCategoryStyles(props.resource.category))
const isVideo = computed(() => props.resource.sourceType === 'video' || props.resource.category === '视频')
const isDocLike = computed(() => props.resource.sourceType === 'doc' || props.resource.category === '文档')

const bilibiliPreviewUrl = computed(() => {
  if (!props.resource.bilibiliBvid) return ''
  return `https://player.bilibili.com/player.html?isOutside=true&bvid=${props.resource.bilibiliBvid}&page=1&autoplay=0&high_quality=1&danmaku=0`
})

const formattedViews = computed(() => {
  const views = props.resource.views || 0
  if (views >= 10000) return `${(views / 10000).toFixed(1)}万`
  if (views >= 1000) return `${(views / 1000).toFixed(1)}k`
  return String(views)
})

const danmakuCount = computed(() => {
  const seed = Array.from(props.resource.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return Math.max(18, Math.round((props.resource.views || 120) * 0.08 + (seed % 60)))
})

const visibleTags = computed(() => props.resource.tags.slice(0, props.viewMode === 'grid' ? 3 : 4))

const coverKicker = computed(() => {
  if (isVideo.value) return '视频讲解'
  if (isDocLike.value) return '图文笔记'
  if (props.resource.category === '代码') return '实战代码'
  if (props.resource.category === '习题') return '专项练习'
  return props.resource.category
})

const coverTitle = computed(() => props.resource.topic || props.resource.domain || props.resource.category)

const visualExcerpt = computed(() => {
  const fromSlide = props.resource.slides?.[0]?.content?.split('\n').find(line => line.trim().length > 8)
  return (fromSlide || props.resource.description).replace(/[•*#`]/g, '').slice(0, 46)
})

const coverClass = computed(() => ({
  'edu-resource-card__cover--video': isVideo.value,
  'edu-resource-card__cover--doc': isDocLike.value,
  'edu-resource-card__cover--exercise': props.resource.category === '习题',
  'edu-resource-card__cover--code': props.resource.category === '代码',
}))

const authorInitial = computed(() => (props.resource.author || 'E').trim().charAt(0).toUpperCase())

const simulatedHours = computed(() => {
  const minText = props.resource.estimatedTime || '30分钟'
  const parsed = parseInt(minText)
  return isNaN(parsed) ? 1.0 : parseFloat((parsed / 60).toFixed(1))
})

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showOptions.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

function handleMarkCompleted() {
  emit('markAsCompleted', simulatedHours.value, props.resource.title)
  showOptions.value = false
}

function handleToggleStarFromMenu() {
  emit('toggleStar', props.resource.id)
  showOptions.value = false
}

function handleCardClickFromMenu() {
  emit('cardClick', props.resource.id)
  showOptions.value = false
}
</script>

<style scoped>
.edu-resource-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(82, 124, 210, 0.14);
  background: linear-gradient(135deg, rgba(18, 17, 28, 0.78), rgba(12, 11, 18, 0.56));
  backdrop-filter: blur(16px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 14px 42px rgba(3, 5, 22, 0.3);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.edu-resource-card:hover {
  transform: translateY(-4px);
  border-color: rgba(96, 165, 250, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 52px rgba(3, 5, 22, 0.45),
    0 0 20px rgba(59, 130, 246, 0.1);
}

.edu-resource-card--grid {
  display: flex;
  min-height: 336px;
  border-radius: 12px;
  flex-direction: column;
}

.edu-resource-card--list {
  display: grid;
  grid-template-columns: minmax(180px, 230px) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  min-height: 132px;
  padding: 12px;
  border-radius: 12px;
}

.edu-resource-card--list:hover {
  transform: translateY(-2px);
}

.edu-resource-card__media {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #050711;
}

.edu-resource-card__media--list {
  width: 100%;
  border-radius: 9px;
}

.edu-resource-card__iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  pointer-events: none;
  background: #050711;
}

.edu-resource-card__cover {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  padding: 16px;
  color: #f8fbff;
  background:
    radial-gradient(circle at 16% 12%, rgba(255, 255, 255, 0.22), transparent 23%),
    linear-gradient(135deg, rgba(59, 130, 246, 0.72), rgba(16, 185, 129, 0.62));
}

.edu-resource-card__cover::before {
  content: "";
  position: absolute;
  inset: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  pointer-events: none;
}

.edu-resource-card__cover--doc {
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px) 0 0 / 22px 22px,
    linear-gradient(135deg, rgba(56, 189, 248, 0.72), rgba(168, 85, 247, 0.5));
}

.edu-resource-card__cover--video {
  background:
    radial-gradient(circle at 70% 18%, rgba(255, 255, 255, 0.24), transparent 20%),
    linear-gradient(135deg, rgba(37, 99, 235, 0.8), rgba(236, 72, 153, 0.54));
}

.edu-resource-card__cover--exercise {
  background:
    linear-gradient(135deg, rgba(245, 158, 11, 0.76), rgba(244, 63, 94, 0.56));
}

.edu-resource-card__cover--code {
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 14px),
    linear-gradient(135deg, rgba(20, 184, 166, 0.72), rgba(15, 23, 42, 0.74));
}

.edu-resource-card__cover-icon {
  width: 26px;
  height: 26px;
  opacity: 0.92;
}

.edu-resource-card__cover-kicker {
  width: fit-content;
  padding: 3px 7px;
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(5, 7, 17, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 11px;
  font-weight: 700;
}

.edu-resource-card__cover strong {
  position: relative;
  z-index: 1;
  font-size: 18px;
  line-height: 1.15;
}

.edu-resource-card__cover p {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.82);
}

.edu-resource-card__note-lines {
  position: absolute;
  right: 16px;
  top: 18px;
  display: grid;
  gap: 5px;
  width: 78px;
}

.edu-resource-card__note-lines span {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
}

.edu-resource-card__note-lines span:nth-child(2) {
  width: 70%;
}

.edu-resource-card__note-lines span:nth-child(3) {
  width: 84%;
}

.edu-resource-card__media-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, transparent 48%, rgba(2, 6, 23, 0.76));
}

.edu-resource-card__play {
  position: absolute;
  left: 10px;
  bottom: 10px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: white;
  background: rgba(0, 0, 0, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.edu-resource-card__play--large {
  left: 50%;
  top: 50%;
  bottom: auto;
  width: 46px;
  height: 46px;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.48);
}

.edu-resource-card__duration {
  position: absolute;
  right: 9px;
  bottom: 9px;
  padding: 2px 7px;
  border-radius: 5px;
  color: #fff;
  background: rgba(0, 0, 0, 0.64);
  font-size: 11px;
  font-weight: 700;
}

.edu-resource-card__media--list .edu-resource-card__duration {
  top: 9px;
  bottom: auto;
}

.edu-resource-card__media-meta {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  gap: 8px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 700;
}

.edu-resource-card__media-meta span,
.edu-resource-card__metrics div {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.edu-resource-card__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  padding: 12px 14px 8px;
}

.edu-resource-card__list-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.edu-resource-card__headline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.edu-resource-card__category {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 6px;
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  font-size: 12px;
  font-weight: 700;
}

.edu-resource-card__level {
  padding: 3px 7px;
  border-radius: 6px;
  color: #ffb86b;
  background: rgba(255, 143, 58, 0.14);
  font-size: 11px;
  font-weight: 700;
}

.edu-resource-card h4 {
  margin: 0;
  color: #f8fbff;
  font-size: 16px;
  line-height: 1.35;
  font-weight: 800;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.edu-resource-card--list h4 {
  font-size: 15px;
  -webkit-line-clamp: 1;
}

.edu-resource-card p {
  margin: 0;
  color: #98a0cf;
  font-size: 13px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.edu-resource-card--list p {
  -webkit-line-clamp: 1;
}

.edu-resource-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.edu-resource-card__tags span {
  padding: 3px 7px;
  border-radius: 5px;
  color: #8f98d3;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11px;
}

.edu-resource-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px 12px 14px;
}

.edu-resource-card__author {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7e89bc;
  font-size: 12px;
}

.edu-resource-card__author span:not(.edu-resource-card__avatar) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edu-resource-card__avatar {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  color: #e0f2fe;
  background: rgba(59, 130, 246, 0.16);
  border: 1px solid rgba(96, 165, 250, 0.2);
  font-size: 11px;
  font-weight: 800;
}

.edu-resource-card__metrics {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: 76px;
  color: #8b92cc;
  font-size: 12px;
}

.edu-resource-card__metrics > span {
  color: #6b74a8;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.edu-resource-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.edu-resource-card__icon-btn {
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  color: #6b74a8;
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.edu-resource-card__icon-btn:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}

.edu-resource-card__more {
  position: absolute;
  top: 8px;
  right: 8px;
}

.edu-resource-card__menu {
  position: absolute;
  right: 0;
  z-index: 30;
  width: 152px;
  margin-top: 6px;
  padding: 5px;
  border-radius: 9px;
  background: rgba(8, 8, 22, 0.98);
  border: 1px solid rgba(96, 165, 250, 0.16);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.42);
}

.edu-resource-card__menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 0;
  border-radius: 7px;
  color: #cbd5e1;
  background: transparent;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.edu-resource-card__menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.edu-resource-card__menu-item--done {
  color: #34d399;
}

.edu-resource-card__menu-item--open {
  color: #60a5fa;
}

@media (max-width: 900px) {
  .edu-resource-card--list {
    grid-template-columns: 150px minmax(0, 1fr);
  }

  .edu-resource-card__metrics,
  .edu-resource-card__actions {
    display: none;
  }
}

@media (max-width: 640px) {
  .edu-resource-card--list {
    grid-template-columns: 1fr;
  }

  .edu-resource-card__media--list {
    aspect-ratio: 16 / 9;
  }
}
</style>
