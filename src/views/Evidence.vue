<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Activity, AlertTriangle, ArrowRight, Clock, Cpu, Database, Shield, Zap } from 'lucide-vue-next'
import { fetchEvidenceTraces, fetchEvidenceSummary } from '@/lib/api'
import type { TraceRecord, EvidenceSummaryResponse } from '@/types/api'

const traces = ref<TraceRecord[]>([])
const summary = ref<EvidenceSummaryResponse | null>(null)
const loading = ref(true)
const expandedTrace = ref<string | null>(null)

function toggleTrace(id: string) {
  expandedTrace.value = expandedTrace.value === id ? null : id
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString('zh-CN')
}

function riskColor(flag: string) {
  if (flag.includes('高风险') || flag.includes('低置信度')) return 'var(--color-accent-rose)'
  return 'var(--color-accent-amber)'
}

function agentColor(name: string) {
  const colors: Record<string, string> = {
    ProfileAgent: '#00d4ff',
    ResourceAgent: '#7c3aed',
    PathAgent: '#06d6a0',
    TutorAgent: '#3b82f6',
    EvaluationAgent: '#f59e0b',
    ReflectionAgent: '#f43f5e',
  }
  return colors[name] || '#888'
}

onMounted(async () => {
  try {
    const [tracesData, summaryData] = await Promise.all([
      fetchEvidenceTraces(50),
      fetchEvidenceSummary(),
    ])
    traces.value = tracesData.items
    summary.value = summaryData
  } catch {
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="evidence-page">
    <div class="page-header">
      <div class="header-left">
        <div class="hero-badge">Agent Evidence Trace</div>
        <h1 class="page-title">多智能体<span class="gradient-text">协作证据链</span></h1>
        <p class="page-subtitle">追踪每次画像分析、资源生成、路径规划、辅导回答、评估反馈的完整协作过程与证据。</p>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <Activity :size="20" class="spin-icon" />
      <span>加载证据链数据...</span>
    </div>

    <template v-else>
      <div v-if="summary" class="summary-grid">
        <div class="summary-card" style="--s-color: #00d4ff">
          <div class="summary-icon"><Database :size="20" stroke-width="1.5" /></div>
          <div class="summary-body">
            <span class="summary-value">{{ summary.totalTraces }}</span>
            <span class="summary-label">总 Trace 数</span>
          </div>
        </div>
        <div class="summary-card" style="--s-color: #7c3aed">
          <div class="summary-icon"><Cpu :size="20" stroke-width="1.5" /></div>
          <div class="summary-body">
            <span class="summary-value">{{ Object.keys(summary.agentCounts).length }}</span>
            <span class="summary-label">活跃 Agent</span>
          </div>
        </div>
        <div class="summary-card" style="--s-color: #f59e0b">
          <div class="summary-icon"><Shield :size="20" stroke-width="1.5" /></div>
          <div class="summary-body">
            <span class="summary-value">{{ summary.fallbackRate }}%</span>
            <span class="summary-label">Fallback 率</span>
          </div>
        </div>
        <div class="summary-card" style="--s-color: #f43f5e">
          <div class="summary-icon"><AlertTriangle :size="20" stroke-width="1.5" /></div>
          <div class="summary-body">
            <span class="summary-value">{{ summary.riskRate }}%</span>
            <span class="summary-label">风险标记率</span>
          </div>
        </div>
        <div class="summary-card" style="--s-color: #06d6a0">
          <div class="summary-icon"><Clock :size="20" stroke-width="1.5" /></div>
          <div class="summary-body">
            <span class="summary-value">{{ summary.avgDurationMs }}ms</span>
            <span class="summary-label">平均耗时</span>
          </div>
        </div>
        <div class="summary-card" :style="{ '--s-color': summary.llmAvailable ? '#06d6a0' : '#f59e0b' }">
          <div class="summary-icon"><Zap :size="20" stroke-width="1.5" /></div>
          <div class="summary-body">
            <span class="summary-value">{{ summary.llmAvailable ? '已连接' : 'Fallback' }}</span>
            <span class="summary-label">LLM 状态</span>
          </div>
        </div>
      </div>

      <div v-if="summary && Object.keys(summary.agentCounts).length > 0" class="agent-stats">
        <h3 class="section-title">Agent 调用统计</h3>
        <div class="agent-stats-grid">
          <div v-for="(count, agent) in summary.agentCounts" :key="agent" class="agent-stat" :style="{ '--a-color': agentColor(agent as string) }">
            <span class="agent-dot" />
            <span class="agent-name">{{ agent }}</span>
            <span class="agent-count">{{ count }} 次</span>
          </div>
        </div>
      </div>

      <div class="traces-section">
        <h3 class="section-title">最近协作 Trace</h3>
        <div v-if="traces.length === 0" class="empty-state">
          <Database :size="32" stroke-width="1" />
          <p>暂无 trace 数据。完成画像问卷或使用辅导功能后将自动生成证据链。</p>
        </div>
        <div v-else class="trace-list">
          <div
            v-for="trace in traces"
            :key="trace.requestId"
            class="trace-card"
            :class="{ expanded: expandedTrace === trace.requestId }"
            @click="toggleTrace(trace.requestId)"
          >
            <div class="trace-header">
              <div class="trace-id">
                <span class="trace-badge" :class="{ fallback: trace.fallbackUsed }">
                  {{ trace.fallbackUsed ? 'Fallback' : 'LLM' }}
                </span>
                <code>{{ trace.requestId }}</code>
              </div>
              <div class="trace-meta">
                <span v-for="agent in trace.agents" :key="agent" class="agent-tag" :style="{ '--a-color': agentColor(agent) }">
                  {{ agent }}
                </span>
                <span class="trace-duration">{{ trace.durationMs }}ms</span>
              </div>
            </div>
            <div class="trace-summary">
              <span class="trace-input">{{ trace.inputsSummary }}</span>
              <ArrowRight :size="12" stroke-width="1.5" class="trace-arrow" />
              <span class="trace-output">{{ trace.outputsSummary }}</span>
            </div>
            <div v-if="trace.riskFlags.length > 0" class="trace-risks">
              <AlertTriangle :size="12" stroke-width="1.5" />
              <span v-for="flag in trace.riskFlags" :key="flag" class="risk-tag" :style="{ color: riskColor(flag) }">{{ flag }}</span>
            </div>
            <div v-if="expandedTrace === trace.requestId" class="trace-detail">
              <div class="detail-row">
                <span class="detail-label">时间</span>
                <span class="detail-value">{{ formatTime(trace.timestamp) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">证据</span>
                <div class="detail-evidence">
                  <span v-for="(ev, i) in trace.evidence" :key="i" class="evidence-tag">{{ ev }}</span>
                </div>
              </div>
              <div class="detail-row">
                <span class="detail-label">输入</span>
                <code class="detail-code">{{ trace.inputsSummary }}</code>
              </div>
              <div class="detail-row">
                <span class="detail-label">输出</span>
                <code class="detail-code">{{ trace.outputsSummary }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.evidence-page {
  min-height: 100vh;
  padding-bottom: 60px;
}

.page-header {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 40px 0;
}

.header-left {
  max-width: 600px;
}

.hero-badge {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(0, 212, 255, 0.08);
  color: var(--color-accent-cyan);
  border: 1px solid rgba(0, 212, 255, 0.12);
  margin-bottom: 12px;
}

.page-title {
  margin: 0 0 8px;
  color: #fff;
  font-size: 34px;
  font-family: var(--font-display);
  font-weight: 400;
}

.gradient-text {
  background: linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-subtitle {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.loading-state {
  max-width: 1200px;
  margin: 40px auto;
  padding: 0 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.spin-icon {
  animation: spin 1s linear infinite;
  color: var(--color-accent-cyan);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.summary-grid {
  max-width: 1200px;
  margin: 24px auto 0;
  padding: 0 40px;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}

.summary-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--s-color) 12%, transparent);
  color: var(--s-color);
  flex-shrink: 0;
}

.summary-body {
  flex: 1;
}

.summary-value {
  display: block;
  color: #fff;
  font-size: 18px;
  font-family: var(--font-display);
}

.summary-label {
  display: block;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.agent-stats {
  max-width: 1200px;
  margin: 24px auto 0;
  padding: 0 40px;
}

.section-title {
  color: #fff;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 20px;
  margin: 0 0 16px;
}

.agent-stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.agent-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
}

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--a-color);
  box-shadow: 0 0 10px color-mix(in srgb, var(--a-color) 60%, transparent);
}

.agent-name {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}

.agent-count {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-family: var(--font-mono);
}

.traces-section {
  max-width: 1200px;
  margin: 32px auto 0;
  padding: 0 40px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-state p {
  font-size: 14px;
  max-width: 400px;
  line-height: 1.6;
}

.trace-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trace-card {
  padding: 16px 20px;
  border-radius: 14px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.trace-card:hover {
  border-color: rgba(0, 212, 255, 0.2);
}

.trace-card.expanded {
  border-color: rgba(0, 212, 255, 0.3);
}

.trace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.trace-id {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trace-id code {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-family: var(--font-mono);
}

.trace-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(0, 212, 255, 0.1);
  color: var(--color-accent-cyan);
  border: 1px solid rgba(0, 212, 255, 0.15);
}

.trace-badge.fallback {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-accent-amber);
  border-color: rgba(245, 158, 11, 0.15);
}

.trace-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  background: color-mix(in srgb, var(--a-color) 12%, transparent);
  color: var(--a-color);
  border: 1px solid color-mix(in srgb, var(--a-color) 20%, transparent);
}

.trace-duration {
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-family: var(--font-mono);
}

.trace-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.trace-arrow {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.trace-input,
.trace-output {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-risks {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
}

.risk-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(244, 63, 94, 0.06);
  border: 1px solid rgba(244, 63, 94, 0.1);
  font-size: 10px;
}

.trace-detail {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.detail-label {
  flex-shrink: 0;
  width: 48px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  padding-top: 2px;
}

.detail-value {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.detail-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.evidence-tag {
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(0, 212, 255, 0.06);
  border: 1px solid rgba(0, 212, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
}

.detail-code {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-family: var(--font-mono);
  word-break: break-all;
}

@media (max-width: 900px) {
  .page-header { padding: 28px 20px 0; }
  .summary-grid {
    padding: 0 20px;
    grid-template-columns: repeat(3, 1fr);
  }
  .agent-stats, .traces-section { padding: 0 20px; }
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
