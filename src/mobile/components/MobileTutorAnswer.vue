<template>
  <div class="tutor-answer">
    <template v-for="(block, index) in blocks" :key="index">
      <pre v-if="block.kind === 'code'"><code>{{ block.text }}</code></pre>
      <ul v-else-if="block.kind === 'list'"><li v-for="(item, itemIndex) in block.items" :key="itemIndex"><template v-for="(part, partIndex) in inline(item)" :key="partIndex"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template></li></ul>
      <component :is="block.kind === 'heading' ? 'h3' : 'p'" v-else><template v-for="(part, partIndex) in inline(block.text)" :key="partIndex"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template></component>
    </template>
    <details v-if="context.length" class="tutor-answer__context"><summary>辅导方式说明</summary><p v-for="line in context" :key="line">{{ line }}</p></details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ text: string }>()
interface Block { kind: 'paragraph' | 'heading' | 'code' | 'list'; text: string; items?: string[] }
// 仅使用文本插值展示内容；模型给出的 HTML 不会被作为 DOM 执行。
const parsed = computed(() => {
  const output: Block[] = []
  const context: string[] = []
  let code: string[] | null = null
  let paragraph: string[] = []
  const flush = () => { if (paragraph.length) { output.push({ kind: 'paragraph', text: paragraph.join('\n') }); paragraph = [] } }
  for (const line of props.text.split('\n')) {
    if (line.trim().startsWith('```')) {
      flush()
      if (code) { output.push({ kind: 'code', text: code.join('\n') }); code = null } else code = []
    } else if (code) code.push(line)
    else if (/^(当前模式|脚手架级别)[：:]/.test(line.trim())) { flush(); context.push(line.trim()) }
    else if (!line.trim()) flush()
    else if (/^#{1,6}\s/.test(line)) { flush(); output.push({ kind: 'heading', text: line.replace(/^#{1,6}\s+/, '') }) }
    else if (/^\s*([-*+] |\d+[.)] )/.test(line)) {
      flush()
      const item = line.replace(/^\s*([-*+] |\d+[.)] )/, '')
      const previous = output[output.length - 1]
      if (previous?.kind === 'list') previous.items!.push(item)
      else output.push({ kind: 'list', text: '', items: [item] })
    } else paragraph.push(line)
  }
  flush()
  if (code) output.push({ kind: 'code', text: code.join('\n') })
  return { blocks: output, context }
})
const blocks = computed(() => parsed.value.blocks)
const context = computed(() => parsed.value.context)
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map(part => part.startsWith('**') && part.endsWith('**')
    ? { kind: 'strong', text: part.slice(2, -2) }
    : part.startsWith('`') && part.endsWith('`') ? { kind: 'code', text: part.slice(1, -1) } : { kind: 'text', text: part })
}
</script>

<style scoped>
.tutor-answer { white-space: normal; }
.tutor-answer p { margin: 0 0 12px; white-space: pre-wrap; }
.tutor-answer p:last-child { margin-bottom: 0; }
.tutor-answer h3 { font-size: 14px; margin: 12px 0 8px; }
.tutor-answer strong { font-weight: 600; color: var(--m-text); }
.tutor-answer ul { padding-left: 20px; margin: 10px 0 12px; }
.tutor-answer li + li { margin-top: 7px; }
.tutor-answer code { border-radius: 4px; background: var(--m-surface-2); padding: 2px 4px; font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
.tutor-answer pre { max-width: 100%; overflow-x: auto; border: 1px solid var(--m-border); padding: 12px; background: var(--m-surface-2); border-radius: 12px; line-height: 1.65; }
.tutor-answer pre code { padding: 0; white-space: pre; }
.tutor-answer__context { font-size: 12px; color: var(--m-text-faint); border-top: 1px solid var(--m-border); margin-top: 14px; padding-top: 8px; }
.tutor-answer__context summary { cursor: pointer; min-height: 36px; display: flex; align-items: center; }
.tutor-answer__context p { margin-bottom: 4px; }
</style>
