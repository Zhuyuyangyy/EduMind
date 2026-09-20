<template>
  <div class="start-screen">
    <div class="star-bg"></div>
    <div class="content">
      <div class="title-group" :style="{ animationDelay: '0.1s' }">
        <div class="logo-icon">
          <Orbit class="orbit-icon" :size="48" />
        </div>
      <h1 class="title font-display">智学星枢宇宙学习路径</h1>
        <p class="subtitle">在浩瀚星海中，探索知识的无限可能</p>
      </div>
      <div class="info-cards">
        <div
          v-for="(card, index) in infoCards"
          :key="card.label"
          class="info-card"
          :style="{ animationDelay: `${0.3 + index * 0.1}s` }"
        >
          <span class="card-num font-display">{{ card.num }}</span>
          <span class="card-label">{{ card.label }}</span>
        </div>
      </div>
      <button
        class="start-btn"
        :style="{ animationDelay: '0.7s' }"
        @click="$emit('start')"
      >
        <Rocket :size="20" />
        <span>开始探索</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Orbit, Rocket } from '@lucide/vue'

defineEmits<{ start: [] }>()

const infoCards = [
  { num: '24', label: '门课程' },
  { num: '5', label: '大星系' },
  { num: '20', label: '周学习路线' },
]
</script>

<style scoped>
.start-screen {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #0a0a2e 0%, #000010 100%);
  animation: fadeIn 0.8s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.star-bg {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.8), transparent),
    radial-gradient(1px 1px at 50% 70%, rgba(255,255,255,0.6), transparent),
    radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,255,255,0.9), transparent),
    radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.5), transparent),
    radial-gradient(1px 1px at 70% 50%, rgba(255,255,255,0.7), transparent),
    radial-gradient(1px 1px at 10% 60%, rgba(255,255,255,0.6), transparent),
    radial-gradient(1.5px 1.5px at 90% 80%, rgba(255,255,255,0.8), transparent),
    radial-gradient(1px 1px at 60% 10%, rgba(255,255,255,0.5), transparent);
  background-size: 200px 200px;
  animation: twinkle 4s ease-in-out infinite alternate;
}

@keyframes twinkle {
  0% { opacity: 0.7; }
  100% { opacity: 1; }
}

.content {
  position: relative;
  text-align: center;
  z-index: 1;
}

.title-group {
  margin-bottom: 48px;
  opacity: 0;
  animation: fadeInUp 0.8s ease forwards;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(79, 195, 247, 0.15), rgba(186, 104, 200, 0.15));
  border: 1px solid rgba(79, 195, 247, 0.2);
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}

.orbit-icon {
  color: #4FC3F7;
  filter: drop-shadow(0 0 8px rgba(79, 195, 247, 0.5));
}

.title {
  font-size: 52px;
  font-weight: 700;
  background: linear-gradient(135deg, #4FC3F7, #BA68C8, #F06292);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
  letter-spacing: -0.02em;
  filter: drop-shadow(0 0 30px rgba(79, 195, 247, 0.2));
}

.subtitle {
  font-size: 18px;
  color: #8899bb;
  font-weight: 300;
}

.info-cards {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 56px;
}

.info-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 36px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
  cursor: default;
}

.info-card:hover {
  transform: translateY(-4px);
  background: rgba(255,255,255,0.06);
  border-color: rgba(79, 195, 247, 0.25);
  box-shadow: 0 8px 32px rgba(79, 195, 247, 0.1);
}

.card-num {
  font-size: 36px;
  font-weight: 700;
  color: #4FC3F7;
  line-height: 1;
  margin-bottom: 8px;
  text-shadow: 0 0 20px rgba(79, 195, 247, 0.3);
}

.card-label {
  font-size: 14px;
  color: #8899bb;
  font-weight: 400;
}

.start-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 18px 52px;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #4FC3F7, #BA68C8);
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 24px rgba(79, 195, 247, 0.3);
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
  font-family: 'Noto Sans SC', sans-serif;
}

.start-btn:hover {
  transform: scale(1.05) translateY(-2px);
  box-shadow: 0 8px 40px rgba(79, 195, 247, 0.5), 0 0 60px rgba(186, 104, 200, 0.2);
}

.start-btn:active {
  transform: scale(0.98);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@media (max-width: 640px) {
  .title {
    font-size: 32px;
  }
  .subtitle {
    font-size: 15px;
  }
  .info-cards {
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }
  .info-card {
    width: 200px;
    padding: 16px 24px;
  }
  .start-btn {
    padding: 14px 40px;
    font-size: 16px;
  }
}
</style>
