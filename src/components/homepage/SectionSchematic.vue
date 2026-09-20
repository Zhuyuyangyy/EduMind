<script setup lang="ts">
const T = {
  cyan: '#00d4ff', purple: '#7c3aed', emerald: '#06d6a0',
  amber: '#f59e0b', rose: '#f43f5e', blue: '#3b82f6',
  text: '#e8edf5', textSub: '#8892b0', textTri: '#4a5568',
  serif: "'Instrument Serif', 'Noto Serif SC', serif",
  sans: "'Outfit', 'PingFang SC', sans-serif",
  mono: "'JetBrains Mono', monospace",
}

interface Module {
  id: string; name: string; role: string; color: string
  inputs: string[]; outputs: string[]; specs: string[]
}

const modules: Module[] = [
  { id: 'profile', name: '画像智能体', role: 'PROFILE', color: T.purple,
    inputs: ['学习行为', '题目记录', '测评结果'], outputs: ['画像向量', '薄弱标签'],
    specs: ['六维画像', '置信度可追溯', '按学习周期更新'] },
  { id: 'path', name: '路径规划智能体', role: 'PATH', color: T.cyan,
    inputs: ['画像向量', '课程图谱'], outputs: ['学习序列', '优先级'],
    specs: ['6 阶段', '约束: 时长 + 难度'] },
  { id: 'resource', name: '资源推荐智能体', role: 'RESOURCE', color: T.emerald,
    inputs: ['路径节点', '资源池'], outputs: ['资源 ID 集', '难度分布'],
    specs: ['本地知识索引', 'Evidence Trace'] },
  { id: 'tutor', name: 'AI 辅导智能体', role: 'TUTOR', color: T.amber,
    inputs: ['提问', '上下文'], outputs: ['回答', '后续提示'],
    specs: ['10 种模式', '准确 94%'] },
  { id: 'eval', name: '评估智能体', role: 'EVAL', color: T.rose,
    inputs: ['答题', '行为日志'], outputs: ['得分', 'ΔPainPoints'],
    specs: ['8 维度', '本周 8 次'] },
  { id: 'feedback', name: '反馈智能体', role: 'FEEDBACK', color: T.blue,
    inputs: ['测评结果', 'ΔPainPoints'], outputs: ['画像更新', '路径修正'],
    specs: ['反向传播', '实时触发'] },
]

const MW = 230
const MH = 170
const PAD_L = 80
const PAD_R = 80
const PAD_T = 100
const SCH_W = 1640
const SCH_H = 540
const GAP = ((SCH_W - PAD_L - PAD_R) - modules.length * MW) / (modules.length - 1)

const modX = (i: number) => PAD_L + i * (MW + GAP)
const modCx = (i: number) => modX(i) + MW / 2
const modCy = PAD_T + MH / 2

const pipeLabels = ['画像向量', '学习序列', '资源 ID 集', '会话结果', 'ΔPainPoints']

/* Feedback arc path */
const arcDepth = 130
const feedbackD = (() => {
  const lastI = modules.length - 1
  const x1 = modCx(lastI), y1 = PAD_T + MH
  const x2 = modCx(0), y2 = PAD_T + MH
  return `M ${x1} ${y1} C ${x1} ${y1 + arcDepth}, ${x2} ${y2 + arcDepth}, ${x2} ${y2}`
})()

const specs = [
  ['闭环延迟', '< 1.2 s'], ['消息吞吐', '337 msg/min'],
  ['活跃模块', '6 / 6'], ['平均决策置信度', '92%'],
  ['失败回滚', '已配置'], ['可观测性', 'OpenTelemetry'],
]
</script>

<template>
  <section class="section-schematic">
    <div class="sch-inner">
      <!-- Header -->
      <div class="sch-header">
        <div class="sch-eyebrow" :style="`color: ${T.purple}`">
          FIG.01 · MULTI-AGENT CLOSED-LOOP ARCHITECTURE
        </div>
        <h2 class="sch-title">
          这不是 5 张能力卡，这是<span :style="`color: ${T.purple}`"> 5 个真实运行的模块</span>
        </h2>
        <p class="sch-desc">
          每个智能体有明确的输入输出契约，主流程把数据顺次传下去，
          评估输出的 <span :style="`color: ${T.rose}`">ΔPainPoints</span> 沿反馈回路传回画像 — 闭环由此成立。
        </p>
      </div>

      <!-- Schematic SVG -->
      <div class="sch-canvas">
        <div class="sch-corner sch-corner-tl">◇ 智学星枢 · v2.1 · 闭环架构 · REV 26052026</div>
        <div class="sch-corner sch-corner-tr">SCALE 1:1 · {{ SCH_W }}mm × {{ SCH_H }}mm</div>

        <svg :viewBox="`0 0 ${SCH_W} ${SCH_H}`" class="sch-svg">
          <defs>
            <pattern id="sch-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,212,255,0.05)" stroke-width="0.5" />
            </pattern>
            <pattern id="sch-grid-major" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(0,212,255,0.08)" stroke-width="0.6" />
            </pattern>
          </defs>

          <!-- Grid backgrounds -->
          <rect :width="SCH_W" :height="SCH_H" fill="url(#sch-grid)" />
          <rect :width="SCH_W" :height="SCH_H" fill="url(#sch-grid-major)" />

          <!-- Dimension bracket -->
          <g :transform="`translate(${PAD_L}, ${PAD_T - 50})`">
            <line x1="0" y1="0" :x2="SCH_W - PAD_L - PAD_R" y2="0"
              :stroke="T.textTri" stroke-opacity="0.5" stroke-width="0.5" />
            <line x1="0" y1="-4" x2="0" y2="4" :stroke="T.textTri" stroke-opacity="0.5" stroke-width="0.5" />
            <line :x1="SCH_W - PAD_L - PAD_R" y1="-4" :x2="SCH_W - PAD_L - PAD_R" y2="4"
              :stroke="T.textTri" stroke-opacity="0.5" stroke-width="0.5" />
            <text :x="(SCH_W - PAD_L - PAD_R) / 2" y="-8" text-anchor="middle"
              :fill="T.textTri" font-size="9.5" :font-family="T.mono" letter-spacing="0.18em">
              PRIMARY DATA FLOW · ▶ 顺序流转
            </text>
          </g>

          <!-- Forward pipes -->
          <g v-for="(_, i) in modules.length - 1" :key="`pipe-${i}`">
            <line :x1="modX(i) + MW" :y1="modCy" :x2="modX(i + 1) - 12" :y2="modCy"
              stroke="rgba(0,212,255,0.45)" stroke-width="1.5" />
            <line :x1="modX(i) + MW" :y1="modCy" :x2="modX(i + 1) - 12" :y2="modCy"
              :stroke="T.cyan" stroke-width="1.5" stroke-dasharray="4 8"
              class="pipe-flow" :style="`animation-duration: ${3 + i * 0.5}s`" />
            <path :d="`M ${modX(i + 1) - 12} ${modCy - 4} L ${modX(i + 1) - 2} ${modCy} L ${modX(i + 1) - 12} ${modCy + 4} Z`"
              :fill="T.cyan" opacity="0.85" />
            <!-- Label -->
            <g :transform="`translate(${(modX(i) + MW + modX(i + 1)) / 2}, ${modCy - 18})`">
              <rect x="-44" y="-9" width="88" height="18" rx="3"
                fill="rgba(8, 10, 24, 0.95)" stroke="rgba(0,212,255,0.25)" stroke-width="0.5" />
              <text x="0" y="3" text-anchor="middle"
                :fill="T.cyan" font-size="9.5" :font-family="T.mono" letter-spacing="0.06em">
                {{ pipeLabels[i] }}
              </text>
            </g>
          </g>

          <!-- Feedback arc -->
          <path :d="feedbackD" fill="none" :stroke="T.rose" stroke-opacity="0.15" stroke-width="8" />
          <path :d="feedbackD" fill="none" :stroke="T.rose" stroke-opacity="0.7"
            stroke-width="1.5" stroke-dasharray="6 4" />
          <path :d="feedbackD" fill="none" :stroke="T.rose"
            stroke-width="2" stroke-dasharray="3 60" class="feedback-flow" />
          <!-- Arrowhead -->
          <path :d="`M ${modCx(0) - 5} ${PAD_T + MH + 12} L ${modCx(0)} ${PAD_T + MH + 2} L ${modCx(0) + 5} ${PAD_T + MH + 12} Z`"
            :fill="T.rose" />
          <!-- Feedback label -->
          <g :transform="`translate(${(modCx(modules.length - 1) + modCx(0)) / 2}, ${PAD_T + MH + arcDepth - 12})`">
            <rect x="-72" y="-13" width="144" height="26" rx="4"
              fill="rgba(8, 10, 24, 0.95)" :stroke="`${T.rose}55`" stroke-width="1" />
            <text x="0" y="-2" text-anchor="middle"
              :fill="T.rose" font-size="10" :font-family="T.mono" letter-spacing="0.18em" font-weight="500">
              FEEDBACK LOOP
            </text>
            <text x="0" y="8" text-anchor="middle"
              :fill="T.textSub" font-size="9.5" :font-family="T.sans">
              反向更新画像维度
            </text>
          </g>

          <!-- Module boxes -->
          <g v-for="(m, i) in modules" :key="m.id">
            <!-- Drop shadow -->
            <rect :x="modX(i) + 2" :y="PAD_T + 4" :width="MW" :height="MH" rx="8"
              fill="#000" opacity="0.4" />
            <!-- Body -->
            <rect :x="modX(i)" :y="PAD_T" :width="MW" :height="MH" rx="8"
              fill="rgba(10, 14, 32, 0.92)" :stroke="m.color" stroke-opacity="0.6" stroke-width="1.5" />
            <!-- Top color bar -->
            <rect :x="modX(i)" :y="PAD_T" :width="MW" height="3"
              :fill="m.color" rx="8" />
            <!-- Role + Name -->
            <text :x="modX(i) + 14" :y="PAD_T + 24"
              :fill="m.color" font-size="10" :font-family="T.mono" letter-spacing="0.2em" font-weight="500">
              {{ m.role }}
            </text>
            <text :x="modX(i) + 14" :y="PAD_T + 42"
              :fill="T.text" font-size="15" :font-family="T.serif" font-weight="500">
              {{ m.name }}
            </text>
            <!-- Module badge -->
            <g :transform="`translate(${modX(i) + MW - 26}, ${PAD_T + 14})`">
              <rect x="-12" y="-2" width="24" height="18" rx="3"
                :fill="`${m.color}22`" :stroke="`${m.color}44`" stroke-width="0.5" />
              <text x="0" y="10" text-anchor="middle"
                :fill="m.color" font-size="9" :font-family="T.mono" font-weight="600">
                M0{{ i + 1 }}
              </text>
            </g>
            <!-- Divider -->
            <line :x1="modX(i) + 14" :y1="PAD_T + 70" :x2="modX(i) + MW - 14" :y2="PAD_T + 70"
              :stroke="m.color" stroke-opacity="0.18" stroke-width="0.5" stroke-dasharray="2 3" />
            <!-- IN -->
            <text :x="modX(i) + 14" :y="PAD_T + 86"
              :fill="T.textTri" font-size="8" :font-family="T.mono" letter-spacing="0.18em">IN ◀</text>
            <text v-for="(inp, j) in m.inputs" :key="`in-${j}`"
              :x="modX(i) + 36" :y="PAD_T + 86 + j * 11"
              :fill="T.text" font-size="9.5" :font-family="T.sans">
              {{ inp }}
            </text>
            <!-- OUT -->
            <text :x="modX(i) + MW - 14" :y="PAD_T + 130" text-anchor="end"
              :fill="T.textTri" font-size="8" :font-family="T.mono" letter-spacing="0.18em">▶ OUT</text>
            <text v-for="(out, j) in m.outputs" :key="`out-${j}`"
              :x="modX(i) + MW - 36" :y="PAD_T + 130 + j * 11" text-anchor="end"
              :fill="m.color" font-size="9.5" :font-family="T.sans" font-weight="500">
              {{ out }}
            </text>
            <!-- I/O ports -->
            <circle v-for="(_, j) in m.inputs" :key="`ip-${j}`"
              :cx="modX(i)" :cy="PAD_T + 88 + j * 11"
              r="2" :fill="m.color" opacity="0.7" />
            <circle v-for="(_, j) in m.outputs" :key="`op-${j}`"
              :cx="modX(i) + MW" :cy="PAD_T + 132 + j * 11"
              r="2" :fill="m.color" opacity="0.7" />
            <!-- Specs -->
            <text v-for="(spec, j) in m.specs" :key="`sp-${j}`"
              :x="modX(i) + 14 + j * 70" :y="PAD_T + MH - 14"
              :fill="T.textSub" font-size="8.5" :font-family="T.mono">
              {{ spec }}
            </text>
          </g>

          <!-- Latency callout -->
          <line :x1="modCx(3) + 60" :y1="PAD_T + 5" :x2="modCx(3) + 110" :y2="PAD_T - 30"
            :stroke="T.textTri" stroke-width="0.5" stroke-dasharray="2 2" />
          <text :x="modCx(3) + 113" :y="PAD_T - 32"
            :fill="T.amber" font-size="9" :font-family="T.mono" letter-spacing="0.1em">
            ⚡ 平均延迟 56ms
          </text>

          <!-- Bottom note -->
          <text :x="SCH_W - PAD_R - 5" :y="SCH_H - 20" text-anchor="end"
            :fill="T.textTri" font-size="9" :font-family="T.mono" letter-spacing="0.18em">
            NOTE: 评估输出每 2.4s 触发一次画像更新
          </text>
        </svg>
      </div>

      <!-- Spec strip -->
      <div class="sch-specs">
        <span class="sch-specs-label" :style="`color: ${T.purple}`">SYSTEM SPEC</span>
        <span v-for="([k, v], i) in specs" :key="k" class="sch-spec">
          <span class="sch-spec-key">{{ k }}</span>
          <span class="sch-spec-val">{{ v }}</span>
          <span v-if="i < specs.length - 1" class="sch-spec-sep">·</span>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-schematic {
  padding: 90px 56px 60px;
  position: relative;
}

.sch-inner {
  max-width: 1760px;
  margin: 0 auto;
}

.sch-header { margin-bottom: 24px; }

.sch-eyebrow {
  font-size: 10px;
  letter-spacing: 0.24em;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  margin-bottom: 8px;
}

.sch-title {
  margin: 0;
  font-family: 'Instrument Serif', serif;
  font-size: 40px;
  font-weight: 500;
  color: #e8edf5;
  letter-spacing: -0.02em;
  line-height: 1.1;
  text-wrap: balance;
}

.sch-desc {
  margin: 10px 0 0;
  font-size: 13.5px;
  color: #8892b0;
  max-width: 640px;
}

.sch-canvas {
  position: relative;
  background: linear-gradient(180deg, rgba(10, 14, 32, 0.6) 0%, rgba(6, 8, 20, 0.4) 100%);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 18px;
  padding: 20px 0;
  overflow: hidden;
}

.sch-corner {
  position: absolute;
  top: 14px;
  font-size: 9px;
  color: #4a5568;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.22em;
}

.sch-corner-tl { left: 24px; }
.sch-corner-tr { right: 24px; letter-spacing: 0.18em; }

.sch-svg {
  display: block;
  width: 100%;
  height: auto;
}

.pipe-flow {
  animation: dash-flow 3s linear infinite;
}

.feedback-flow {
  animation: dash-flow 4s linear infinite;
}

@keyframes dash-flow {
  to { stroke-dashoffset: -30; }
}

.sch-specs {
  margin-top: 14px;
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
  padding: 14px 22px;
  background: rgba(10, 14, 32, 0.5);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 10px;
}

.sch-specs-label {
  font-size: 9.5px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.22em;
  font-weight: 500;
}

.sch-spec {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  color: #8892b0;
}

.sch-spec-key {
  color: #4a5568;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.08em;
}

.sch-spec-val {
  color: #e8edf5;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

.sch-spec-sep {
  color: #4a5568;
  margin-left: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .pipe-flow, .feedback-flow {
    animation: none !important;
  }
}

@media (max-width: 900px) {
  .section-schematic {
    padding: 60px 24px 40px;
  }
  .sch-title { font-size: 28px; }
}
</style>
