<template>
  <section class="growth">
    <h1 class="m-section-title">学习成长 <span class="m-section-title__sub">示例数据 · P2-2 接入真实画像</span></h1>

    <!-- 学习路径 -->
    <div class="m-card">
      <h2 class="m-card__title">你的学习路径 <span class="m-card__more">诊断 → 练习 → 评估</span></h2>
      <ol class="growth__path">
        <li v-for="(step, i) in pathSteps" :key="step.title" :class="['growth__step', step.state]">
          <span class="growth__step-dot">{{ i + 1 }}</span>
          <div class="growth__step-body">
            <p class="growth__step-title">{{ step.title }}</p>
            <p class="growth__step-desc">{{ step.desc }}</p>
          </div>
          <span class="m-badge" :class="step.badgeClass">{{ step.stateLabel }}</span>
        </li>
      </ol>
    </div>

    <!-- 能力画像 -->
    <h2 class="m-section-title">能力画像</h2>
    <div class="m-card">
      <div v-for="dim in dimensions" :key="dim.label" class="growth__dim">
        <div class="growth__dim-head">
          <span>{{ dim.label }}</span>
          <span class="growth__dim-num">{{ dim.value }}</span>
        </div>
        <div class="m-progress"><div class="m-progress__fill" :style="{ width: dim.value + '%' }" /></div>
      </div>
    </div>

    <!-- 错题反馈 -->
    <h2 class="m-section-title">错题反馈</h2>
    <div class="m-card">
      <div v-if="mistakes.length" class="growth__mistakes">
        <article v-for="m in mistakes" :key="m.title" class="growth__mistake">
          <p class="growth__mistake-title">{{ m.title }}</p>
          <p class="growth__mistake-cause">错因：{{ m.cause }}</p>
          <p class="growth__mistake-fix">建议：{{ m.fix }}</p>
        </article>
      </div>
      <div v-else class="m-empty">
        <span class="m-empty__icon">✓</span>
        <p class="m-empty__text">暂无错题记录<br>完成一次测评后，这里会出现错因分析</p>
      </div>
    </div>

    <!-- 阶段性进步 -->
    <h2 class="m-section-title">阶段性进步</h2>
    <div class="m-card growth__progress-card">
      <div class="growth__stat">
        <span class="growth__stat-num">12</span>
        <span class="growth__stat-label">连续学习（天）</span>
      </div>
      <div class="growth__stat">
        <span class="growth__stat-num">+8</span>
        <span class="growth__stat-label">本周掌握点数</span>
      </div>
      <div class="growth__stat">
        <span class="growth__stat-num">73%</span>
        <span class="growth__stat-label">阶段目标进度</span>
      </div>
    </div>

    <p class="growth__footnote">
      以上为设计评审用示例数据。P2-2 起，画像与路径将读取当前账号的服务端真实记录（已按账号隔离），
      测评结果会驱动画像与路径更新。
    </p>
  </section>
</template>

<script setup lang="ts">
const pathSteps = [
  { title: '学情诊断', desc: '6 维问卷 + 答题信号', state: 'done', stateLabel: '已完成', badgeClass: 'm-badge--success' },
  { title: '专项练习', desc: 'BFS / 队列 · 3 题', state: 'doing', stateLabel: '进行中', badgeClass: 'm-badge--info' },
  { title: '阶段评估', desc: '测评 + 错因分析', state: 'todo', stateLabel: '未开始', badgeClass: '' },
]

const dimensions = [
  { label: '知识基础', value: 61 },
  { label: '学习速度', value: 68 },
  { label: '逻辑思维', value: 72 },
  { label: '创造力', value: 55 },
  { label: '专注力', value: 64 },
  { label: '自律力', value: 70 },
]

const mistakes = [
  { title: 'BFS 入队时未标记 visited', cause: '概念混淆：把「发现」和「处理」当成同一时刻', fix: '重做路径第 2 步的 3 道判断题' },
  { title: '队列判空条件写反', cause: '粗心：front > rear 与 rear < front 混淆', fix: '在 AI 导师里问「队列判空的两种写法」' },
]
</script>

<style scoped>
.growth__path {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.growth__step {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  padding: var(--m-space-3) 0;
  border-bottom: 1px solid var(--m-border);
}
.growth__step:last-child {
  border-bottom: none;
}

.growth__step-dot {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: var(--m-radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--m-text-sm);
  font-weight: 700;
  background: var(--m-surface-2);
  color: var(--m-text-dim);
}
.growth__step.done .growth__step-dot {
  background: var(--m-success-soft);
  color: var(--m-success);
}
.growth__step.doing .growth__step-dot {
  background: var(--m-primary-soft);
  color: var(--m-primary);
}

.growth__step-body {
  flex: 1;
  min-width: 0;
}

.growth__step-title {
  font-size: var(--m-text-base);
  font-weight: 600;
  margin: 0 0 2px;
}

.growth__step-desc {
  font-size: var(--m-text-sm);
  color: var(--m-text-faint);
  margin: 0;
}

.growth__dim {
  margin-bottom: var(--m-space-3);
}
.growth__dim:last-child {
  margin-bottom: 0;
}

.growth__dim-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  margin-bottom: var(--m-space-2);
}

.growth__dim-num {
  color: var(--m-text);
  font-weight: 600;
}

.growth__mistakes {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.growth__mistake {
  border-left: 2px solid var(--m-warn);
  padding-left: var(--m-space-3);
}

.growth__mistake-title {
  font-size: var(--m-text-base);
  font-weight: 600;
  margin: 0 0 var(--m-space-1);
  line-height: 1.5;
}

.growth__mistake-cause,
.growth__mistake-fix {
  font-size: var(--m-text-sm);
  color: var(--m-text-dim);
  line-height: 1.7;
  margin: 0;
}

.growth__progress-card {
  display: flex;
  justify-content: space-between;
  text-align: center;
}

.growth__stat {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-1);
}

.growth__stat-num {
  font-size: var(--m-text-xl);
  font-weight: 700;
  color: var(--m-primary);
}

.growth__stat-label {
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
}

.growth__footnote {
  margin-top: var(--m-space-6);
  font-size: var(--m-text-xs);
  color: var(--m-text-faint);
  line-height: 1.8;
}
</style>
