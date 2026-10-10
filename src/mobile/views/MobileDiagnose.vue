<template>
  <section class="diagnose">
    <h1 class="m-section-title">学习自评 <span class="m-section-title__sub">结果标注为「自评画像」</span></h1>
    <p class="diagnose__intro">给六个维度打分（0–100）。保存后可以一键生成知识路径。自评是主观依据，后续测评结果会逐步修正画像。</p>

    <div class="m-card diagnose__card">
      <div v-for="dim in dimensions" :key="dim.label" class="diagnose__dim">
        <div class="diagnose__dim-head">
          <span>{{ dim.label }}</span>
          <span class="diagnose__dim-num">{{ dim.value }}</span>
        </div>
        <input
          :value="dim.value"
          class="diagnose__slider"
          type="range"
          min="0"
          max="100"
          step="5"
          :aria-label="dim.label"
          @input="dim.value = Number(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="diagnose__actions">
      <button class="m-btn m-btn--primary m-btn--block" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存自评画像' }}
      </button>
      <button class="m-btn m-btn--ghost m-btn--block" :disabled="saving" @click="onSaveAndGenerate">
        {{ saving ? '处理中…' : '保存并生成知识路径' }}
      </button>
    </div>

    <div v-if="message" class="m-error" :class="ok ? 'diagnose__ok' : ''" role="alert">
      <b>{{ message }}</b>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiPost } from '@/lib/api'
import { bumpDataEpoch } from '@/mobile/data/learning-data'
import type { KnowledgePath } from '@/mobile/data/types'

const router = useRouter()
const saving = ref(false)
const message = ref('')
const ok = ref(false)

const dimensions = reactive([
  { label: '知识基础', value: 50 },
  { label: '学习速度', value: 50 },
  { label: '逻辑思维', value: 50 },
  { label: '创造力', value: 50 },
  { label: '专注力', value: 50 },
  { label: '自律力', value: 50 },
])

async function saveProfile(): Promise<boolean> {
  const payload = {
    dimensions: dimensions.map(d => ({ label: d.label, value: d.value, color: '#54d6ff' })),
    totalScore: Math.round(dimensions.reduce((sum, d) => sum + d.value, 0) / dimensions.length),
    weaknesses: dimensions.filter(d => d.value < 40).map(d => ({ tag: d.label, count: 1 })),
    recommendations: [],
    source: 'mobile-self-assessment',
  }
  const res = await apiPost<{ totalScore: number }>('/api/profile/save', payload)
  return typeof res?.totalScore === 'number'
}

async function onSave() {
  saving.value = true
  message.value = ''
  try {
    await saveProfile()
    bumpDataEpoch()
    ok.value = true
    message.value = '自评画像已保存'
    setTimeout(() => router.replace('/today'), 600)
  } catch (err) {
    ok.value = false
    message.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function onSaveAndGenerate() {
  saving.value = true
  message.value = ''
  try {
    await saveProfile()
    const path = await apiPost<KnowledgePath>('/api/knowledge-path/generate', {})
    if (!path?.phases?.length) throw new Error('路径生成结果为空')
    bumpDataEpoch()
    ok.value = true
    message.value = '画像与知识路径已生成'
    setTimeout(() => router.replace('/today'), 600)
  } catch (err) {
    ok.value = false
    message.value = err instanceof Error ? err.message : '保存或生成失败'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.diagnose__intro {
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  line-height: 1.8;
  margin: 0 0 var(--m-space-4);
}

.diagnose__dim {
  margin-bottom: var(--m-space-4);
}
.diagnose__dim:last-child {
  margin-bottom: 0;
}

.diagnose__dim-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--m-text-md);
  color: var(--m-text-dim);
  margin-bottom: var(--m-space-2);
}

.diagnose__dim-num {
  color: var(--m-primary);
  font-weight: 700;
}

.diagnose__slider {
  width: 100%;
  accent-color: #54d6ff;
  height: 28px;
}

.diagnose__actions {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
  margin-top: var(--m-space-5);
}

.diagnose__ok {
  background: var(--m-success-soft);
  border-color: rgba(114, 240, 189, 0.3);
  color: var(--m-success);
  margin-top: var(--m-space-4);
}
</style>
