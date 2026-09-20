<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  controlBeatId?: string
  controlNonce?: number
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)

function postControlBeat() {
  if (!props.controlBeatId) return
  frameRef.value?.contentWindow?.postMessage({
    type: 'agenthub:setBeat',
    id: props.controlBeatId,
  }, '*')
}

watch(
  () => props.controlNonce,
  postControlBeat,
)
</script>

<template>
  <section class="agent-hub-section">
    <div class="hub-body">
      <div class="hub-frame-shell">
        <iframe
          ref="frameRef"
          class="agent-hub-frame"
          src="/agenthub/index.html"
          title="12智能体与6模块协同枢纽"
          loading="eager"
          @load="postControlBeat"
        />
      </div>
    </div>

    <div class="hub-head">
        <h2>7 个核心智能体在 6 个模块中协同，把一次学习卡顿转化为自适应闭环</h2>
    </div>
  </section>
</template>

<style scoped>
.agent-hub-section {
  position: relative;
  z-index: 1;
  padding: 58px 36px 42px;
  max-width: 1520px;
  margin: 0 auto;
}

.hub-head {
  margin-top: 18px;
  text-align: center;
}

.hub-head h2 {
  margin: 0;
  color: #fff;
  font-family: 'Instrument Serif', 'Noto Serif SC', serif;
  font-size: clamp(30px, 3.4vw, 42px);
  font-weight: 500;
  line-height: 1.08;
  text-shadow: 0 0 32px rgba(0, 212, 255, 0.18);
}

.hub-body {
  display: block;
}

.hub-frame-shell {
  overflow: hidden;
  border: 1px solid rgba(120, 160, 220, 0.16);
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(0, 212, 255, 0.08), transparent 60%),
    rgba(5, 6, 16, 0.52);
  backdrop-filter: blur(10px);
}

.agent-hub-frame {
  display: block;
  width: 100%;
  height: clamp(600px, 50vw, 740px);
  min-height: 0;
  border: 0;
  background: transparent;
}

@media (max-width: 720px) {
  .agent-hub-section {
    padding: 40px 16px 30px;
  }

  .agent-hub-frame {
    height: 480px;
  }

  .hub-head,
  .hub-body {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 721px) and (max-width: 1180px) {
  .hub-head,
  .hub-body {
    grid-template-columns: 1fr;
  }
}
</style>
