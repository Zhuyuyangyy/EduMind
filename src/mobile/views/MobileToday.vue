<template>
  <section class="today">
    <!-- 问候 -->
    <div class="today__greeting">
      <h1 class="today__hello">{{ greeting }}，{{ displayName }}</h1>
      <p class="today__date">{{ todayLabel }}</p>
    </div>

    <!-- 今日唯一任务（P2-1：示例数据，顶栏有统一标记） -->
    <div class="m-card m-card--accent today__hero">
      <div class="today__hero-tag">
        <span class="m-badge m-badge--info">今天先学这一件事</span>
        <span class="m-demo-tag">示例</span>
      </div>
      <h2 class="today__hero-title">用 8 分钟理解 BFS 的 visited 标记时机</h2>
      <p class="today__hero-desc">入队时标记防重复入队，出队时标记防重复出队——先想清楚两者差别，再写代码。</p>
      <div class="today__hero-meta">
        <span>⏱ 约 8 分钟</span>
        <span>◎ 计算机基础</span>
        <span>✦ 1 个 AI 提示</span>
      </div>
      <RouterLink to="/tutor" class="m-btn m-btn--primary m-btn--block">开始学习</RouterLink>
    </div>

    <!-- 今日目标进度（示例） -->
    <h2 class="m-section-title">今日目标 <span class="m-section-title__sub">示例数据</span></h2>
    <div class="m-card">
      <div class="today__goal">
        <span>完成 1 次 AI 答疑</span>
        <span class="today__goal-num">0 / 1</span>
      </div>
      <div class="m-progress"><div class="m-progress__fill" style="width: 0%" /></div>
      <div class="today__goal">
        <span>完成 1 组练习（3 题）</span>
        <span class="today__goal-num">0 / 3</span>
      </div>
      <div class="m-progress"><div class="m-progress__fill" style="width: 0%" /></div>
    </div>

    <!-- 推荐任务（示例） -->
    <h2 class="m-section-title">为你推荐 <span class="m-section-title__sub">示例数据</span></h2>
    <div class="today__tasks">
      <article v-for="task in tasks" :key="task.title" class="m-card today__task">
        <div class="today__task-head">
          <span class="m-badge" :class="task.badgeClass">{{ task.tag }}</span>
          <span class="today__task-time">{{ task.time }}</span>
        </div>
        <h3 class="today__task-title">{{ task.title }}</h3>
        <p class="today__task-desc">{{ task.desc }}</p>
      </article>
    </div>

    <p class="today__footnote">
      当前为 P2-1 设计系统演示：页面结构、导航与交互已就绪，学习内容为明确标注的示例数据；
      真实学习状态接入在 P2-2。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getAuthSession } from '@/lib/auth'

const session = getAuthSession()
const displayName = computed(() => session?.name || session?.account || '同学')

const hour = new Date().getHours()
const greeting = computed(() => (hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'))
const todayLabel = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

const tasks = [
  {
    tag: '纠偏',
    badgeClass: 'm-badge--warn',
    time: '5 分钟',
    title: '队列：front / rear 指针什么时候动',
    desc: '用 3 道判断题确认你对指针移动时机的理解。',
  },
  {
    tag: '巩固',
    badgeClass: 'm-badge--success',
    time: '6 分钟',
    title: '图遍历：什么时候该用 visited',
    desc: '对比 DFS 与 BFS 的标记策略差异。',
  },
  {
    tag: '预习',
    badgeClass: 'm-badge--info',
    time: '4 分钟',
    title: '最短路径：Dijkstra 在等什么',
    desc: '从 BFS 到带权图的一步跨越。',
  },
]
</script>

<style scoped>
.today__greeting {
  margin: var(--m-space-2) 0 var(--m-space-4);
}

.today__hello {
  font-size: var(--m-text-xl);
  margin: 0 0 var(--m-space-1);
}

.today__date {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: 0;
}

.today__hero {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.today__hero-tag {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
}

.today__hero-title {
  font-size: var(--m-text-lg);
  line-height: 1.5;
  margin: 0;
}

.today__hero-desc {
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  line-height: 1.7;
  margin: 0;
}

.today__hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-3);
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
}

.today__goal {
  display: flex;
  justify-content: space-between;
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  margin-bottom: var(--m-space-2);
}

.today__goal + .m-progress {
  margin-bottom: var(--m-space-4);
}

.today__goal-num {
  color: var(--m-text);
  font-weight: 600;
}

.today__tasks {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.today__task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--m-space-2);
}

.today__task-time {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.today__task-title {
  font-size: var(--m-text-base);
  margin: 0 0 var(--m-space-1);
  line-height: 1.5;
}

.today__task-desc {
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
  line-height: 1.6;
  margin: 0;
}

.today__footnote {
  margin-top: var(--m-space-6);
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  line-height: 1.8;
}
</style>
