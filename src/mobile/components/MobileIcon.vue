<template>
  <svg
    class="m-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <component :is="paths[name]" />
  </svg>
</template>

<script setup lang="ts">
/**
 * 智学星枢统一线性图标体系（P4-2C · A2）。
 * 24×24 网格 / 1.5 描边 / 圆角帽——替换早期 ⌒ ✦ ⌂ ◎ 字符图标
 * （字符渲染跨平台不一致、无语义权重）。颜色继承 currentColor，
 * 由使用方控制（tab 激活=星青、AI=星紫、成就=暖金）。
 *
 * 新增图标：在 ICON_PATHS 加一条 path 定义即可，禁止在页面里
 * 手写 SVG 或退回字符图标。
 */
import { h, type FunctionalComponent } from 'vue'

/** 图标名（字面量联合，新增图标时同步追加） */
export type IconName =
  | 'today' | 'tutor' | 'growth' | 'profile' | 'diagnose' | 'practice'
  | 'settings' | 'back' | 'refresh' | 'star' | 'sparkle' | 'check' | 'close'
  | 'chevronRight' | 'path' | 'clock' | 'target' | 'chart' | 'book'
  | 'alert' | 'cloud'

withDefaults(defineProps<{
  name: IconName
  size?: number | string
  strokeWidth?: number | string
}>(), { size: 20, strokeWidth: 2 }) // 描边 2 与桌面 lucide 一致（P4-2C A8）

const ICON_PATHS: Record<IconName, FunctionalComponent> = {
  // 今日学习：日历 + 星点
  today: () => h('g', {}, [
    h('rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 3 }),
    h('path', { d: 'M3.5 9.5h17M8 3v3.5M16 3v3.5' }),
    h('path', { d: 'M12 13.2l.9 1.9 2 .3-1.5 1.5.4 2-1.8-1-1.8 1 .4-2-1.5-1.5 2-.3z' }),
  ]),
  // AI 导师：对话气泡 + 四角星
  tutor: () => h('g', {}, [
    h('path', { d: 'M20.5 12.2c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4.5 20.5l1.3-3.4A6.9 6.9 0 0 1 3.5 12.2c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z' }),
    h('path', { d: 'M12 8.6l.75 1.6 1.65.25-1.2 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.2 1.65-.25z' }),
  ]),
  // 学习成长：上升星轨
  growth: () => h('g', {}, [
    h('path', { d: 'M3.5 17.5l5-5 3.5 3 4.5-6' }),
    h('path', { d: 'M13.5 9.5h3.5v3.5' }),
    h('path', { d: 'M18.5 4.5l.55 1.2 1.2.55-1.2.55-.55 1.2-.55-1.2-1.2-.55 1.2-.55z' }),
  ]),
  // 我的：用户环
  profile: () => h('g', {}, [
    h('circle', { cx: 12, cy: 8.5, r: 3.6 }),
    h('path', { d: 'M4.8 20c.9-3.4 3.7-5.4 7.2-5.4s6.3 2 7.2 5.4' }),
  ]),
  // 学习自评：雷达
  diagnose: () => h('g', {}, [
    h('path', { d: 'M12 3.2l8 4.6v8.4l-8 4.6-8-4.6V7.8z' }),
    h('path', { d: 'M12 7.6l4.4 2.5v4.8L12 17.4l-4.4-2.5v-4.8z' }),
    h('circle', { cx: 12, cy: 12, r: 1.2 }),
  ]),
  // 练习：靶心
  practice: () => h('g', {}, [
    h('circle', { cx: 12, cy: 12, r: 8.2 }),
    h('circle', { cx: 12, cy: 12, r: 4.4 }),
    h('circle', { cx: 12, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' }),
  ]),
  // 设置：滑杆
  settings: () => h('g', {}, [
    h('path', { d: 'M4 8h10M18 8h2M4 16h4M12 16h8' }),
    h('circle', { cx: 16, cy: 8, r: 2.2 }),
    h('circle', { cx: 10, cy: 16, r: 2.2 }),
  ]),
  // 返回
  back: () => h('g', {}, [
    h('path', { d: 'M19 12H5' }),
    h('path', { d: 'M11 6l-6 6 6 6' }),
  ]),
  // 刷新
  refresh: () => h('g', {}, [
    h('path', { d: 'M20 11.5a8 8 0 1 0-2.6 6.2' }),
    h('path', { d: 'M20 4.5v4.5h-4.5' }),
  ]),
  // 星（成就/点亮）
  star: () => h('path', { d: 'M12 3.6l2.3 5 5.4.7-4 3.7 1 5.3-4.7-2.6-4.7 2.6 1-5.3-4-3.7 5.4-.7z' }),
  // AI 闪光
  sparkle: () => h('path', { d: 'M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6-4.6-1.7 4.6-1.7zM18.8 15.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' }),
  // 对勾
  check: () => h('path', { d: 'M4.5 12.5l5 5 10-11' }),
  // 关闭
  close: () => h('path', { d: 'M6 6l12 12M18 6L6 18' }),
  // 右尖号
  chevronRight: () => h('path', { d: 'M9.5 5.5l6.5 6.5-6.5 6.5' }),
  // 知识路径：节点连线
  path: () => h('g', {}, [
    h('path', { d: 'M6 19c0-2.5 2-4.5 4.5-4.5h.5M6 5c0 2.5 2 4.5 4.5 4.5' }),
    h('path', { d: 'M13 10.5h4.5A4.5 4.5 0 0 0 17.5 2M13 13.5h4.5A4.5 4.5 0 0 1 17.5 22' }),
    h('circle', { cx: 4, cy: 5, r: 1.6 }),
    h('circle', { cx: 4, cy: 19, r: 1.6 }),
  ]),
  // 时钟
  clock: () => h('g', {}, [
    h('circle', { cx: 12, cy: 12, r: 8.2 }),
    h('path', { d: 'M12 7.5V12l3 2' }),
  ]),
  // 目标
  target: () => h('g', {}, [
    h('circle', { cx: 12, cy: 12, r: 8.2 }),
    h('circle', { cx: 12, cy: 12, r: 4.6 }),
    h('circle', { cx: 12, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }),
  ]),
  // 图表
  chart: () => h('path', { d: 'M5 19.5V13M10.5 19.5V6.5M16 19.5v-9M21 19.5V9.5' }),
  // 知识库：书本
  book: () => h('g', {}, [
    h('path', { d: 'M4.5 5.5A2 2 0 0 1 6.5 3.5H19v15H6.5a2 2 0 0 0-2 2z' }),
    h('path', { d: 'M4.5 18.5v2M8 7.5h7M8 11h5' }),
  ]),
  // 警示
  alert: () => h('g', {}, [
    h('path', { d: 'M12 4L2.8 19.5h18.4z' }),
    h('path', { d: 'M12 10v4M12 17.2v.2' }),
  ]),
  // 云/降级
  cloud: () => h('g', {}, [
    h('path', { d: 'M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.6a4.2 4.2 0 0 1-.5 8.9z' }),
  ]),
}

const paths: Record<IconName, FunctionalComponent> = ICON_PATHS
</script>

<style scoped>
.m-icon {
  display: block;
  flex: none;
}
</style>
