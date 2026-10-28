<template>
  <section class="workspace-page agent-page">
    <div class="workspace-heading"><div><p class="workspace-eyebrow">ASTRIPATH AGENT</p><h1>让星枢帮你。</h1><p>把一件学习任务，变成可以开始的小步骤。</p></div><MobileIcon name="sparkle" :size="38" /></div>
    <button class="m-btn m-btn--ghost m-btn--sm" @click="customizing=true">为首页添加安全面板</button><WidgetCustomizer v-model="customizing" />
    <PersonalAgentCard class="agent-brief" expanded />
    <div v-if="error" class="m-error" role="alert">{{ error }}<button class="m-btn m-btn--ghost m-btn--sm" @click="load">重新读取</button></div>
    <div v-if="loading" class="m-skeleton m-skeleton--block" />
    <template v-else-if="workspace">
      <form class="m-card agent-compose" @submit.prevent="preview">
        <label class="m-field"><span>你想完成什么？</span><textarea v-model="prompt" class="m-textarea" rows="3" maxlength="1600" required placeholder="例如：把这份讲义整理成复习提纲，标出我需要自测的问题。" /></label>
        <div class="agent-templates"><button v-for="template in templates" :key="template.kind" type="button" :aria-pressed="kind === template.kind" @click="kind = template.kind; prompt = template.prompt"><MobileIcon :name="template.icon" :size="16" />{{ template.title }}</button></div>
        <label class="m-field"><span>关联目标</span><select v-model="goalId" class="m-input"><option value="">仅执行这次任务</option><option v-for="goal in workspace.goals.filter(g => g.status === 'active')" :key="goal.id" :value="goal.id">{{ goal.title }}</option></select></label>
        <details v-if="workspace.materials.length" class="workspace-details"><summary>选择授权资料（{{ materialIds.length }}）</summary><label v-for="material in workspace.materials" :key="material.id" class="workspace-checkbox"><input v-model="materialIds" type="checkbox" :value="material.id" :disabled="material.status !== 'ready'" /><span>{{ material.title }}<small>{{ material.status === 'ready' ? `${material.sections.length} 段可检索文字` : material.message }}</small></span></label></details>
        <p class="workspace-caption">先查看步骤，再确认执行。所选目标和资料可能发送给已配置的模型服务；未选择的资料不会发送。</p>
        <button class="m-btn m-btn--primary m-btn--block" :disabled="busy" type="submit">{{ busy ? '正在准备…' : '预览任务步骤' }}<MobileIcon name="chevronRight" :size="16" /></button>
      </form>
      <div class="workspace-section-head"><h2>我的任务</h2><span>{{ workspace.tasks.length }} 项记录</span></div>
      <div v-if="!workspace.tasks.length" class="workspace-empty"><MobileIcon name="path" :size="28" /><h3>从一个小任务开始</h3><p>计划、资料整理和复习结果，都会保留在这里。</p></div>
      <article v-for="task in workspace.tasks" :key="task.id" class="m-card agent-task" :data-task-status="task.status">
        <div class="workspace-row"><span class="m-badge" :class="task.status === 'completed' ? 'm-badge--success' : 'm-badge--info'">{{ taskLabels[task.status] }}</span><time>{{ dateLabel(task.updatedAt) }}</time></div>
        <h2>{{ task.prompt }}</h2>
        <ol class="agent-steps"><li v-for="(step, index) in task.steps" :key="index" :class="{ done: step.status === 'completed' }"><span>{{ step.status === 'completed' ? '✓' : index + 1 }}</span><div>{{ step.title }}<small v-if="task.status === 'preview' && index === 1">仅在确认后开始</small></div></li></ol>
        <p v-if="task.error" class="m-error" role="alert">{{ task.error }}</p>
        <div v-if="task.status === 'preview'" class="agent-approval"><b>确认后会发生什么</b><p>使用你明确选择的资料生成草稿，并保存到当前工作区。不创建外部日程、不发送消息。</p></div>
        <div v-if="['preview', 'failed', 'cancelled'].includes(task.status)" class="workspace-actions"><button class="m-btn m-btn--primary" :disabled="!!executing" @click="execute(task, task.status === 'preview' ? 'confirm' : 'retry')">{{ task.status === 'preview' ? '确认并开始' : '重新执行' }}</button><button v-if="task.status !== 'cancelled'" class="m-btn m-btn--ghost" @click="execute(task, 'cancel')">取消任务</button></div>
        <div v-if="task.status === 'running'" class="workspace-actions"><span class="workspace-caption">处理完成后会保留结果，可刷新查看；中断超过两分钟可重试。</span><button class="m-btn m-btn--ghost m-btn--sm" @click="execute(task, 'cancel')">停止任务</button><button class="m-btn m-btn--ghost m-btn--sm" @click="load">刷新状态</button><button v-if="Date.now() - Date.parse(task.updatedAt) > 120000" class="m-btn m-btn--ghost m-btn--sm" @click="execute(task, 'retry')">恢复任务</button></div>
        <article v-for="artifact in task.artifacts" :key="artifact.id" class="agent-artifact"><div class="workspace-row"><b>{{ artifact.title }}</b><span class="m-badge" :class="task.source === 'model' ? 'm-badge--success' : 'm-badge--warn'">{{ task.source === 'model' ? '模型草稿' : '规则整理' }}</span></div><pre>{{ artifact.content }}</pre><div class="workspace-actions"><button class="m-btn m-btn--ghost m-btn--sm" @click="downloadText(artifact.title, artifact.content)">导出 Markdown</button><button class="m-btn m-btn--ghost m-btn--sm" :disabled="savingNote === artifact.id" @click="saveNote(artifact.id, artifact.title, artifact.content)">{{ savedNotes.includes(artifact.id) ? '已保存到笔记' : '保存到笔记' }}</button></div><p class="workspace-caption">产物是可编辑草稿，不代表已完成学习或掌握知识。</p></article>
      </article>
    </template>
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import MobileIcon, { type IconName } from '@/mobile/components/MobileIcon.vue'
import WidgetCustomizer from '@/mobile/components/WidgetCustomizer.vue'
import PersonalAgentCard from '@/mobile/components/PersonalAgentCard.vue'
import { activeGoal, changeWorkspace, dateLabel, downloadText, loadWorkspace, taskLabels, type AgentTask, type Workspace } from '@/mobile/data/workspace'
const route = useRoute(), customizing=ref(false)
const workspace = ref<Workspace | null>(null), loading = ref(true), error = ref(''), prompt = ref(''), goalId = ref(''), materialIds = ref<string[]>([]), kind = ref('plan'), busy = ref(false), executing = ref(''), savingNote = ref(''), savedNotes = ref<string[]>([])
const templates: Array<{ kind: string; title: string; prompt: string; icon: IconName }> = [{ kind: 'plan', title: '制定计划', prompt: '根据我的目标与时间，拆出一组可以开始的学习任务。', icon: 'path' }, { kind: 'materials', title: '讲义复习包', prompt: '整理所选资料的原文重点，列出复述和自测问题。', icon: 'book' }, { kind: 'review', title: '调整安排', prompt: '我今天可用时间变少了，请给我一份可确认的精简计划。', icon: 'refresh' }]
let alive = true
onBeforeUnmount(() => { alive = false })
async function load() { error.value = ''; try { const data = await loadWorkspace(); if (!alive) return; workspace.value = data; goalId.value ||= activeGoal(data)?.id || '' } catch (e) { error.value = e instanceof Error ? e.message : '读取失败' } finally { loading.value = false } }
onMounted(async () => { await load(); if (typeof route.query.material === 'string' && workspace.value?.materials.some(m => m.id === route.query.material)) materialIds.value = [route.query.material]; if(typeof route.query.goal==='string'&&workspace.value?.goals.some(g=>g.id===route.query.goal))goalId.value=route.query.goal;if(typeof route.query.topicName==='string')prompt.value=`请帮我理解「${route.query.topicName.slice(0,120)}」，先提出可以核对的学习步骤。`; if (route.query.kind === 'materials') { kind.value = 'materials'; prompt.value = templates[1]!.prompt } })
async function preview() { busy.value = true; error.value = ''; try { await changeWorkspace('tasks', { prompt: prompt.value, kind: kind.value, goalId: goalId.value, materialIds: materialIds.value }); await load() } catch (e) { error.value = e instanceof Error ? e.message : '预览失败' } finally { busy.value = false } }
async function execute(task: AgentTask, action: string) {
  if (action !== 'cancel') executing.value = task.id
  error.value = ''
  if (action !== 'cancel') { task.status = 'running'; task.steps[0]!.status = 'running' }
  try { await changeWorkspace(`tasks/${task.id}/${action}`, {}); if (alive) await load() } catch (e) { error.value = e instanceof Error ? e.message : '操作失败，可刷新查看记录'; if (alive) await load() } finally { if (action !== 'cancel') executing.value = '' }
}
async function saveNote(id: string, title: string, content: string) { if (savedNotes.value.includes(id)) return; savingNote.value = id; try { await changeWorkspace('notes', { title, content }); savedNotes.value.push(id) } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' } finally { savingNote.value = '' } }
</script>
<style scoped>
.agent-compose { display: grid; gap: 18px; }.agent-templates { display: flex; gap: 8px; flex-wrap: wrap; }.agent-templates button { display: flex; align-items: center; gap: 5px; padding: 10px 12px; min-height: 44px; background: var(--m-surface-2); border: 1px solid var(--m-border); border-radius: 12px; color: var(--m-text-dim); font: inherit; font-size: 13px; }.agent-templates button[aria-pressed=true] { color: var(--m-primary); border-color: var(--m-primary-border); }.agent-task { margin-top: 14px; }.agent-task > h2 { font-size: 18px; line-height: 1.6; margin: 16px 0; }.agent-steps { margin: 0 0 20px; padding: 0; list-style: none; }.agent-steps li { display: flex; align-items: center; gap: 12px; padding: 12px 0; font-size: 14px; }.agent-steps li > span { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--m-border); border-radius: 50%; flex: none; color: var(--m-text-faint); }.agent-steps .done > span { background: var(--m-success-soft); color: var(--m-success); }.agent-steps small { display: block; margin-top: 4px; color: var(--m-text-faint); font-size: 12px; }.agent-approval { background: var(--m-primary-soft); border: 1px solid var(--m-primary-border); padding: 16px; border-radius: 16px; margin-bottom: 18px; font-size: 14px; }.agent-approval p { color: var(--m-text-dim); margin: 8px 0 0; line-height: 1.8; }.agent-artifact { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--m-border); }.agent-artifact pre { max-height: 330px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 14px; line-height: 1.9; color: var(--m-text-dim); }
</style>
<style scoped>.agent-brief{margin:18px 0}</style>
