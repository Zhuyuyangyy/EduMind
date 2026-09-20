<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAgentMapStore } from './store/agentMapStore'
import { Search, Play, Square, Activity, Wifi } from 'lucide-vue-next'

const store = useAgentMapStore()
const searchQuery = ref('')
const emit = defineEmits<{
  (e: 'search', query: string): void
}>()

function handleSearch() {
  emit('search', searchQuery.value)
}

function toggleSimulation() {
  if (store.simulationRunning.value) {
    store.stopSimulation()
  } else {
    store.startSimulation()
  }
}

const statusColor = computed(() => {
  const rate = store.systemMetrics.errorRate
  if (rate > 5) return '#ef4444'
  if (rate > 2) return '#f59e0b'
  return '#10b981'
})
</script>

<template>
  <header class="am-header">
    <!-- Left: Brand -->
    <div class="am-header-brand">
      <div class="am-header-dot" />
      <span class="am-header-logo">智学星枢</span>
      <div class="am-header-sep" />
      <div class="am-header-clock">
        <span class="am-header-tick">AGENT MAP</span>
      </div>
    </div>

    <!-- Center: Search -->
    <div class="am-header-search">
      <Search :size="12" stroke-width="2.5" class="am-header-search-icon" />
      <input
        v-model="searchQuery"
        @input="handleSearch"
        placeholder="搜索智能体..."
        class="am-header-search-input"
      />
    </div>

    <!-- Right: Controls -->
    <div class="am-header-controls">
      <!-- Simulation toggle -->
      <button
        class="am-header-btn"
        :class="{ active: store.simulationRunning.value }"
        @click="toggleSimulation"
        :title="store.simulationRunning.value ? '停止模拟' : '启动模拟'"
      >
        <Square v-if="store.simulationRunning.value" :size="12" stroke-width="2" />
        <Play v-else :size="12" stroke-width="2" />
        <span>{{ store.simulationRunning.value ? '运行中' : '已停止' }}</span>
      </button>

      <!-- Network status -->
      <div class="am-header-status">
        <div class="am-header-status-dot" :style="{ background: statusColor }" />
        <span class="am-header-status-text">{{ store.systemMetrics.avgLatency.toFixed(0) }}ms</span>
      </div>

      <!-- Message count -->
      <div class="am-header-msgs">
        <Activity :size="12" stroke-width="2" />
        <span>{{ store.systemMetrics.totalMessages }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.am-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 44px;
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(12px);
  flex-shrink: 0;
  z-index: 10;
}

.am-header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.am-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #06b6d4;
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px rgba(6, 182, 212, 0.6); }
  50% { opacity: 0.6; box-shadow: 0 0 8px rgba(6, 182, 212, 0.3); }
}

.am-header-logo {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: #06b6d4;
  letter-spacing: 0.15em;
}

.am-header-sep {
  width: 1px;
  height: 16px;
  background: rgba(100, 116, 139, 0.3);
}

.am-header-clock {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.am-header-tick {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #06b6d4;
  font-weight: 600;
}

.am-header-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 280px;
  margin: 0 auto;
  padding: 0 10px;
  height: 28px;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.am-header-search-icon {
  color: #475569;
  flex-shrink: 0;
}

.am-header-search-input {
  width: 100%;
  font-size: 11px;
  color: #e2e8f0;
}

.am-header-search-input::placeholder {
  color: #475569;
}

.am-header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.am-header-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(100, 116, 139, 0.2);
  transition: all 0.2s;
}

.am-header-btn:hover {
  color: #e2e8f0;
  border-color: rgba(100, 116, 139, 0.4);
}

.am-header-btn.active {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
}

.am-header-status {
  display: flex;
  align-items: center;
  gap: 5px;
}

.am-header-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.am-header-status-text {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #94a3b8;
}

.am-header-msgs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #64748b;
}
</style>
