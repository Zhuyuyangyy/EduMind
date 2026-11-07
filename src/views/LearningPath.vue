<template>
  <div class="lp-page">
    <section v-if="homeGalaxyContext" class="lp-section lp-home-bridge">
      <div>
        <span>来自画像推荐结果</span>
        <strong>{{ homeGalaxyContext.courseName }}</strong>
        <em>{{ homeGalaxyContext.pathName }} · 当前承接「{{ currentTopicLabel }}」学习路径</em>
      </div>
      <button type="button" class="quiet-btn" @click="selectRecommendedTopic">
        <Target :size="16" />
        回到画像推荐
      </button>
    </section>

    <section class="lp-section lp-section--constellation">
      <div class="lp-section-header">
        <div class="lp-section-badge">KNOWLEDGE CONSTELLATION</div>
        <h2 class="lp-section-title">知识星座</h2>
        <p class="lp-section-desc">
          对话画像生成后呈现知识点关系，点击星点可聚焦当前节点，并联动下方阶段任务。
        </p>
      </div>
      <ResourceConstellationView @select-node="onSelectNode" />
    </section>

    <section class="lp-section lp-section--path">
      <div class="lp-section-header lp-path-header">
        <div>
          <div class="lp-section-badge">LEARNING PATH</div>
          <h2 class="lp-section-title">{{ currentTopicLabel }} 学习路径</h2>
          <p class="lp-section-desc">
            路径由学习画像和掌握度共同决定，把课前、课中、课后、测评和反向更新串成可点击的学习任务。
          </p>
        </div>
        <div class="path-header-actions">
          <button type="button" class="quiet-btn" @click="selectRecommendedTopic">
            <Target :size="16" />
            推荐知识点
          </button>
          <button type="button" class="quiet-btn" @click="cycleChallengeMap">
            <RotateCcw :size="16" />
            {{ currentChallengeMap.name }} {{ selectedMapIdx + 1 }}/{{ CHALLENGE_MAPS.length }}
          </button>
          <button type="button" class="quiet-btn" @click="openTopicResources">
            <BookOpen :size="16" />
            查看全部资源
          </button>
        </div>
      </div>

      <div class="path-shell">
        <div
          class="path-map"
          :class="{ 'path-map--video': currentChallengeMap.type === 'video' }"
          :style="{ backgroundImage: currentChallengeMap.type === 'video' ? 'none' : challengeMapBackground }"
          aria-label="学习路径闯关图"
        >
          <video
            v-if="currentChallengeMap.type === 'video'"
            class="path-map__video"
            :src="currentChallengeMap.video"
            autoplay
            loop
            muted
            playsinline
          />
          <button
            v-for="stage in STAGE_CARDS"
            :key="stage.id"
            type="button"
            :class="['stage-card', stage.className, { active: selectedStageIdx === stage.index }]"
            :style="stageCardStyle(stage.index, stage.color)"
            @click="onSelectStage(stage.index)"
          >
            <span class="stage-card__kicker">STAGE {{ stage.index + 1 }}</span>
            <span class="stage-card__title">{{ stage.label }}</span>
            <span class="stage-card__meta">{{ stage.meta }}</span>
          </button>
        </div>

        <aside class="path-panel" :style="{ '--stage-color': currentStageCard.color }">
          <div class="panel-ambient"></div>
          <div class="panel-topline">
            <span>{{ currentStageCard.label }}</span>
            <span>PHASE 0{{ selectedStageIdx + 1 }} / 05</span>
          </div>

          <div class="panel-title-row">
            <div>
              <h3>{{ currentLevelTitle }}</h3>
              <p>{{ currentStageCard.description }}</p>
            </div>
            <div class="mastery-orb">
              <span>{{ topicMasteryPercent }}</span>
              <small>掌握度</small>
            </div>
          </div>

          <div class="panel-metrics">
            <div>
              <span>所属领域</span>
              <strong>{{ currentDomainLabel }}</strong>
            </div>
            <div>
              <span>学习任务</span>
              <strong>{{ currentStageContent.length }} 个</strong>
            </div>
            <div>
              <span>预计时长</span>
              <strong>{{ estimatedMinutes }} 分钟</strong>
            </div>
          </div>

          <div class="stage-roadmap">
            <button
              v-for="stage in STAGE_CARDS"
              :key="stage.id"
              type="button"
              :class="['roadmap-dot', { active: selectedStageIdx === stage.index }]"
              :style="{ '--stage-color': stage.color }"
              @click="onSelectStage(stage.index)"
              :aria-label="`切换到${stage.label}`"
            >
              <span>{{ stage.index + 1 }}</span>
            </button>
          </div>

          <div class="task-list">
            <div class="task-list__header">
              <span>本阶段资源</span>
              <button type="button" @click="startCurrentStage">
                <Rocket :size="15" />
                开始本阶段
              </button>
            </div>

            <div
              v-for="(task, index) in currentStageContent"
              :key="`${task.title}-${index}`"
              class="task-item"
            >
              <div class="task-index">{{ String(index + 1).padStart(2, '0') }}</div>
              <div class="task-main">
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">
                  <span>{{ resourceTypeLabel(task.type) }}</span>
                  <span v-if="task.isRemedial">评估后补强</span>
                </div>
              </div>
              <div class="task-actions">
                <button type="button" class="icon-btn" @click="goToResource(task, 'doc')" aria-label="查看文档资源">
                  <BookOpen :size="15" />
                </button>
                <button type="button" class="icon-btn" @click="goToResource(task, 'video')" aria-label="查看视频资源">
                  <PlayCircle :size="15" />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="lp-section lp-section--matrix">
      <div class="lp-section-header">
        <div class="lp-section-badge">KNOWLEDGE MATRIX</div>
        <h2 class="lp-section-title">知识点矩阵</h2>
        <p class="lp-section-desc">
          把领域掌握度、知识点数量、推荐补强点和认知层级合在一张矩阵里，点击单元格即可切换学习路径。
        </p>
      </div>
      <ResourceMatrixView
        @select-node="onSelectNode"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpen, PlayCircle, Rocket, RotateCcw, Target } from 'lucide-vue-next'
import { useKnowledgeGraphData } from '../composables/useKnowledgeGraphData'
import type { KnowledgeDomain, KnowledgeTopic } from '../composables/useKnowledgeGraphData'
import { getStageContent } from '../components/resources/mapTransforms'
import type { StageResource, StageResourceType } from '../components/resources/mapTypes'
import ResourceConstellationView from '../components/resources/ResourceConstellationView.vue'
import ResourceMatrixView from '../components/resources/ResourceMatrixView.vue'

const STAGE_CARDS = [
  {
    id: 'preview',
    index: 0,
    label: '课前预习',
    meta: '前置知识 / 建立入口',
    description: '先补齐概念入口和先修关系，降低进入正课时的理解阻力。',
    color: '#00d4ff',
    className: 'stage-card--one',
  },
  {
    id: 'classroom',
    index: 1,
    label: '课中答疑',
    meta: '互动讲解 / 即时反馈',
    description: '围绕当前知识点的疑问展开讲解，把容易卡住的推导拆开。',
    color: '#22d3ee',
    className: 'stage-card--two',
  },
  {
    id: 'practice',
    index: 2,
    label: '课后巩固',
    meta: '练习强化 / 薄弱回补',
    description: '通过练习、代码和例题把知识点从理解推进到可操作。',
    color: '#a78bfa',
    className: 'stage-card--three',
  },
  {
    id: 'assessment',
    index: 3,
    label: '阶段测评',
    meta: '诊断考核 / 画像更新',
    description: '用阶段测评验证是否真正掌握，并把结果回写到学习画像。',
    color: '#f59e0b',
    className: 'stage-card--four',
  },
  {
    id: 'final',
    index: 4,
    label: '期末辅导',
    meta: '综合复盘 / 迁移通关',
    description: '面向综合应用和迁移题，把零散知识整理成可复用能力。',
    color: '#facc15',
    className: 'stage-card--five',
  },
] as const

const CHALLENGE_MAPS = [
  {
    name: '星河光轨',
    image: '/learning-path/chaungguan1.jpg',
    video: '/learning-path/视频去水印_爱给网_aigei_com.mp4',
    type: 'video',
    positions: [
      { left: '9%', top: '62%' },
      { left: '37%', top: '52%' },
      { left: '72%', top: '34%' },
      { left: '38%', top: '22%' },
      { left: '7%', top: '24%' },
    ],
  },
  {
    name: '数据平台',
    image: '/learning-path/challenge-map-2.jpg',
    type: 'image',
    positions: [
      { left: '10%', top: '58%' },
      { left: '9%', top: '22%' },
      { left: '40%', top: '43%' },
      { left: '68%', top: '20%' },
      { left: '70%', top: '62%' },
    ],
  },
  {
    name: '浮岛闯关',
    image: '/learning-path/challenge-map-3.jpg',
    type: 'image',
    positions: [
      { left: '9%', top: '60%' },
      { left: '12%', top: '26%' },
      { left: '42%', top: '18%' },
      { left: '69%', top: '28%' },
      { left: '68%', top: '62%' },
    ],
  },
  {
    name: '峡谷浮台',
    image: '/learning-path/challenge-map-4.jpg',
    type: 'image',
    positions: [
      { left: '10%', top: '62%' },
      { left: '31%', top: '43%' },
      { left: '58%', top: '36%' },
      { left: '30%', top: '17%' },
      { left: '64%', top: '16%' },
    ],
  },
  {
    name: '螺旋星轨',
    image: '/learning-path/challenge-map-5.jpg',
    type: 'image',
    positions: [
      { left: '9%', top: '62%' },
      { left: '23%', top: '34%' },
      { left: '45%', top: '48%' },
      { left: '52%', top: '20%' },
      { left: '66%', top: '14%' },
    ],
  },
] as const

const route = useRoute()
const router = useRouter()
const { domains, loadFromBackend } = useKnowledgeGraphData()
const selectedNodeId = ref<string | null>(null)
const selectedStageIdx = ref(0)
const selectedMapIdx = ref(0)

const HOME_PATH_LABELS: Record<string, string> = {
  'ai-fast': 'AI工程师快车道',
  'fullstack': '全栈开发者路线',
  'systems-eng': '系统工程师路线',
  'data-scientist': '数据科学家路线',
}

const HOME_PROFILE_PREVIEW_SOURCES = new Set(['home-profile-preview', 'home-universe-path'])

const allTopics = computed(() =>
  domains.value.flatMap(domain =>
    domain.topics.map(topic => ({ domain, topic })),
  ),
)

const recommendedTopicPair = computed(() => {
  return [...allTopics.value].sort((a, b) => {
    const aScore = (a.topic.recommended ? -1 : 0) + a.topic.mastery
    const bScore = (b.topic.recommended ? -1 : 0) + b.topic.mastery
    return aScore - bScore
  })[0] ?? null
})

const selectedPair = computed(() => {
  if (!selectedNodeId.value) return null
  return allTopics.value.find(({ topic }) => topic.id === selectedNodeId.value) ?? null
})

const activePair = computed(() => selectedPair.value ?? recommendedTopicPair.value)
const activeTopic = computed<KnowledgeTopic | null>(() => activePair.value?.topic ?? null)
const activeDomain = computed<KnowledgeDomain | null>(() => activePair.value?.domain ?? null)

const currentStageCard = computed(() => STAGE_CARDS[selectedStageIdx.value] ?? STAGE_CARDS[0])
const currentChallengeMap = computed(() => CHALLENGE_MAPS[selectedMapIdx.value] ?? CHALLENGE_MAPS[0])
const challengeMapBackground = computed(() =>
  `linear-gradient(180deg, rgba(1, 4, 12, 0.05), rgba(1, 4, 12, 0.5)), url('${currentChallengeMap.value.image}')`,
)
const currentTopicLabel = computed(() => activeTopic.value?.label ?? '推荐知识点')
const currentDomainLabel = computed(() => activeDomain.value?.name ?? '等待画像生成')
const topicMasteryPercent = computed(() =>
  activeTopic.value ? `${Math.round(activeTopic.value.mastery * 100)}%` : '--',
)

const currentStageContent = computed<StageResource[]>(() => {
  if (!activeTopic.value) return []
  const resources = getStageContent(activeTopic.value.id, selectedStageIdx.value)
  return resources.length > 0 ? resources : buildFallbackResources(activeTopic.value, selectedStageIdx.value)
})

const estimatedMinutes = computed(() => Math.max(20, currentStageContent.value.length * 15))
const currentLevelTitle = computed(() => `${currentTopicLabel.value} / ${currentStageCard.value.label}`)
const homeGalaxyContext = computed(() => {
  const source = String(route.query.source ?? '')
  if (!HOME_PROFILE_PREVIEW_SOURCES.has(source)) return null
  const isProfilePreview = source === 'home-profile-preview'
  const courseName = isProfilePreview
    ? '画像推荐学习路径'
    : String(route.query.courseName || route.query.topic || '画像推导节点')
  const pathId = String(route.query.path || '')
  return {
    courseName,
    pathName: isProfilePreview
      ? '画像 -> 路径 -> 资源 -> 评估熟度 -> 反向画像更新'
      : HOME_PATH_LABELS[pathId] ?? '个性化画像路径',
  }
})

function normalizeTopicText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function findTopicFromHomeQuery() {
  const queryTopic = normalizeTopicText(route.query.topic)
  const queryCourse = normalizeTopicText(route.query.courseName)
  if (!queryTopic && !queryCourse) return null

  const topics = allTopics.value
  return (
    topics.find(({ topic }) => normalizeTopicText(topic.label) === queryTopic)
    ?? topics.find(({ topic }) => normalizeTopicText(topic.label).includes(queryTopic) || queryTopic.includes(normalizeTopicText(topic.label)))
    ?? topics.find(({ topic }) => normalizeTopicText(topic.label) === queryCourse)
    ?? topics.find(({ topic }) => normalizeTopicText(topic.label).includes(queryCourse) || queryCourse.includes(normalizeTopicText(topic.label)))
    ?? topics.find(({ topic }) => topic.concepts?.some(concept => {
      const normalizedConcept = normalizeTopicText(concept)
      return normalizedConcept.includes(queryTopic) || normalizedConcept.includes(queryCourse)
    }))
    ?? null
  )
}

function applyHomeGalaxyContext() {
  if (route.query.source !== 'home-universe-path') return
  const match = findTopicFromHomeQuery()
  if (!match) return
  selectedNodeId.value = match.topic.id
  selectedStageIdx.value = 0
  selectedMapIdx.value = mapIndexForTopic(match.topic.id)
}

function onSelectNode(nodeId: string) {
  selectedNodeId.value = nodeId
  selectedStageIdx.value = 0
  selectedMapIdx.value = mapIndexForTopic(nodeId)
}

function onSelectStage(stageIdx: number) {
  selectedStageIdx.value = stageIdx
}

function selectRecommendedTopic() {
  const next = recommendedTopicPair.value
  if (!next) return
  selectedNodeId.value = next.topic.id
  selectedStageIdx.value = 0
  selectedMapIdx.value = mapIndexForTopic(next.topic.id)
}

function cycleChallengeMap() {
  selectedMapIdx.value = (selectedMapIdx.value + 1) % CHALLENGE_MAPS.length
}

function stageCardStyle(stageIndex: number, color: string) {
  const position = currentChallengeMap.value.positions[stageIndex] ?? CHALLENGE_MAPS[0].positions[stageIndex]
  return {
    '--stage-color': color,
    '--stage-left': position.left,
    '--stage-top': position.top,
  }
}

function openTopicResources() {
  router.push({
    path: '/resources',
    query: {
      topic: activeTopic.value?.label ?? '',
      domain: activeDomain.value?.name ?? '',
      sourceType: 'all',
    },
  })
}

function startCurrentStage() {
  const firstTask = currentStageContent.value[0]
  if (firstTask) {
    goToResource(firstTask, firstTask.type === 'video' ? 'video' : 'doc')
    return
  }
  openTopicResources()
}

function goToResource(resource: StageResource, sourceType: 'doc' | 'video') {
  router.push({
    path: '/resources',
    query: {
      resourceTitle: resource.title,
      domain: activeDomain.value?.name ?? '',
      topic: activeTopic.value?.label ?? '',
      stage: currentStageCard.value.label,
      sourceType,
    },
  })
}

function resourceTypeLabel(type: StageResourceType) {
  const labels: Record<StageResourceType, string> = {
    doc: '文档',
    video: '视频',
    exercise: '练习',
    code: '代码',
  }
  return labels[type]
}

function buildFallbackResources(topic: KnowledgeTopic, stageIdx: number): StageResource[] {
  const templates: StageResource[][] = [
    [
      { title: `${topic.label} 概念速览`, type: 'doc' },
      { title: `${topic.label} 先修知识检查`, type: 'exercise' },
    ],
    [
      { title: `${topic.label} 关键推导讲解`, type: 'video' },
      { title: `${topic.label} 常见误区问答`, type: 'doc' },
    ],
    [
      { title: `${topic.label} 分层练习`, type: 'exercise' },
      { title: `${topic.label} 实战代码任务`, type: 'code' },
    ],
    [
      { title: `${topic.label} 阶段测评`, type: 'exercise', isRemedial: topic.mastery < 0.5 },
      { title: `${topic.label} 错因复盘`, type: 'doc', isRemedial: true },
    ],
    [
      { title: `${topic.label} 综合迁移专题`, type: 'video' },
      { title: `${topic.label} 期末复盘清单`, type: 'doc' },
    ],
  ]
  return templates[stageIdx] ?? templates[0]
}

function mapIndexForTopic(topicId: string) {
  const hash = [...topicId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return hash % CHALLENGE_MAPS.length
}

onMounted(async () => {
  await loadFromBackend(true).catch(() => {})
  applyHomeGalaxyContext()
})
</script>

<style scoped>
.lp-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 44px;
}

.lp-section {
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: 0 40px;
}

.lp-section--constellation,
.lp-section--path {
  max-width: none;
  padding: 0 clamp(28px, 8vw, 200px);
}

.lp-section--constellation {
  padding-top: 24px;
}

.lp-section-header {
  margin: 0 0 16px;
}

.lp-path-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.lp-section-badge {
  margin-bottom: 6px;
  color: rgba(0, 212, 255, 0.66);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.lp-section-title {
  margin: 0 0 5px;
  color: #f3f7ff;
  font-size: 24px;
  font-weight: 750;
  letter-spacing: 0;
}

.lp-section-desc {
  max-width: 820px;
  margin: 0;
  color: #8794b4;
  font-size: 15px;
  line-height: 1.65;
}

.path-header-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.quiet-btn,
.task-list__header button,
.icon-btn,
.stage-card,
.roadmap-dot {
  font: inherit;
}

.quiet-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(12, 18, 36, 0.72);
  color: #dbeafe;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.quiet-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(0, 212, 255, 0.45);
  background: rgba(13, 27, 50, 0.92);
}

.path-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(380px, 0.8fr);
  gap: 18px;
  align-items: stretch;
}

.path-map {
  position: relative;
  min-height: 560px;
  aspect-ratio: 1568 / 1003;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  overflow: hidden;
  background-color: #020617;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.path-map::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 70% 20%, rgba(0, 212, 255, 0.12), transparent 34%);
}

.path-map--video {
  background-color: #020617;
}

.path-map__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.stage-card {
  position: absolute;
  z-index: 2;
  left: var(--stage-left);
  top: var(--stage-top);
  width: min(220px, 24%);
  min-width: 170px;
  padding: 14px 16px 13px;
  text-align: left;
  color: #f8fbff;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--stage-color) 58%, transparent);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(5, 10, 24, 0.88), rgba(7, 13, 30, 0.64));
  box-shadow: 0 14px 26px rgba(0, 0, 0, 0.35), 0 0 22px color-mix(in srgb, var(--stage-color) 22%, transparent);
  backdrop-filter: blur(14px);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.stage-card::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -42px;
  width: 1px;
  height: 42px;
  background: linear-gradient(180deg, var(--stage-color), transparent);
  box-shadow: 0 0 10px var(--stage-color);
}

.stage-card::after {
  content: '';
  position: absolute;
  left: calc(50% - 4px);
  bottom: -49px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--stage-color);
  box-shadow: 0 0 16px var(--stage-color);
}

.stage-card:hover,
.stage-card.active {
  transform: translateY(-4px) scale(1.02);
  border-color: var(--stage-color);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.45), 0 0 30px color-mix(in srgb, var(--stage-color) 44%, transparent);
}

.stage-card__kicker,
.stage-card__meta {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.09em;
}

.stage-card__kicker {
  color: var(--stage-color);
  font-size: 10px;
  font-weight: 800;
}

.stage-card__title {
  display: block;
  margin: 5px 0;
  font-size: 18px;
  font-weight: 760;
}

.stage-card__meta {
  color: #9caed0;
  font-size: 11px;
}

.path-panel {
  position: relative;
  display: flex;
  min-height: 560px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--stage-color) 42%, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  padding: 26px;
  background:
    linear-gradient(145deg, rgba(4, 10, 24, 0.9), rgba(11, 14, 32, 0.82)),
    url('/learning-path/knowledge-panel-bg.jpg') center / cover no-repeat;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.panel-ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 80% 8%, color-mix(in srgb, var(--stage-color) 24%, transparent), transparent 34%);
  opacity: 0.8;
}

.panel-topline,
.panel-title-row,
.panel-metrics,
.stage-roadmap,
.task-list {
  position: relative;
  z-index: 1;
}

.panel-topline {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  color: var(--stage-color);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.panel-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px;
  gap: 18px;
  align-items: start;
  margin-top: 24px;
}

.panel-title-row h3 {
  margin: 0 0 8px;
  color: #ffffff;
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: 0;
}

.panel-title-row p {
  margin: 0;
  color: #9fb0cf;
  font-size: 14px;
  line-height: 1.7;
}

.mastery-orb {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border: 1px solid color-mix(in srgb, var(--stage-color) 50%, transparent);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.28);
  box-shadow: inset 0 0 24px color-mix(in srgb, var(--stage-color) 20%, transparent);
}

.mastery-orb span {
  color: #ffffff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 22px;
  font-weight: 800;
}

.mastery-orb small {
  margin-top: -18px;
  color: #8ea0c0;
  font-size: 11px;
}

.panel-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 22px 0;
}

.panel-metrics div {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
}

.panel-metrics span {
  display: block;
  color: #8090ad;
  font-size: 12px;
}

.panel-metrics strong {
  display: block;
  margin-top: 6px;
  overflow: hidden;
  color: #eef4ff;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-roadmap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
  padding: 0 6px;
}

.stage-roadmap::before {
  content: '';
  position: absolute;
  left: 22px;
  right: 22px;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, #00d4ff, #a78bfa, #facc15);
  opacity: 0.35;
}

.roadmap-dot {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--stage-color) 48%, transparent);
  border-radius: 50%;
  background: #091120;
  color: #dbeafe;
  cursor: pointer;
}

.roadmap-dot.active {
  background: var(--stage-color);
  color: #020617;
  box-shadow: 0 0 22px color-mix(in srgb, var(--stage-color) 72%, transparent);
}

.task-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
}

.task-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  color: #f8fbff;
  font-weight: 750;
}

.task-list__header button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 13px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--stage-color), color-mix(in srgb, var(--stage-color) 62%, #111827));
  color: #04111f;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.24);
}

.task-index {
  color: var(--stage-color);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 800;
}

.task-main {
  min-width: 0;
  flex: 1;
}

.task-title {
  overflow: hidden;
  color: #edf4ff;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  color: #7f8da8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
}

.task-actions {
  display: flex;
  gap: 6px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.055);
  color: #cfe8ff;
  cursor: pointer;
}

.icon-btn:hover {
  border-color: var(--stage-color);
  color: #ffffff;
}

@media (max-width: 1100px) {
  .lp-section--constellation,
  .lp-section--path,
  .lp-section {
    padding: 0 18px;
  }

  .lp-section--constellation {
    padding-top: 22px;
  }

  .lp-path-header,
  .path-shell {
    grid-template-columns: 1fr;
  }

  .lp-path-header {
    display: grid;
    align-items: start;
  }

  .path-map,
  .path-panel {
    min-height: auto;
  }

  .path-shell {
    display: grid;
  }
}

@media (max-width: 760px) {
  .path-header-actions {
    flex-wrap: wrap;
  }

  .path-map {
    aspect-ratio: auto;
    min-height: 680px;
  }

  .stage-card {
    width: calc(100% - 32px);
    min-width: 0;
    left: 16px;
    right: 16px;
  }

  .stage-card::before,
  .stage-card::after {
    display: none;
  }

  .stage-card--one { top: 22px; }
  .stage-card--two { top: 148px; }
  .stage-card--three { top: 274px; }
  .stage-card--four { top: 400px; }
  .stage-card--five { top: 526px; }

  .path-panel {
    padding: 18px;
  }

  .panel-title-row,
  .panel-metrics {
    grid-template-columns: 1fr;
  }

  .mastery-orb {
    width: 76px;
    height: 76px;
  }
}
</style>
