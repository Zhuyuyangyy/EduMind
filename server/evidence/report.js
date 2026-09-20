import { getTraces, getTraceSummary } from './recorder.js'

export function generateTraceReport() {
  const summary = getTraceSummary()
  const recentTraces = getTraces(20)

  let md = '# A3 证据链报告\n\n'
  md += `生成时间: ${new Date().toISOString()}\n\n`

  md += '## 概览\n\n'
  md += `- 总 trace 数: ${summary.totalTraces}\n`
  md += `- fallback 使用次数: ${summary.fallbackCount} (${summary.fallbackRate}%)\n`
  md += `- 风险标记次数: ${summary.riskFlagCount} (${summary.riskRate}%)\n`
  md += `- 平均耗时: ${summary.avgDurationMs}ms\n`
  md += `- 最后 trace 时间: ${summary.lastTraceAt || 'N/A'}\n\n`

  md += '## Agent 调用统计\n\n'
  for (const [agent, count] of Object.entries(summary.agentCounts)) {
    md += `- ${agent}: ${count} 次\n`
  }
  md += '\n'

  md += '## 最近 Trace 列表\n\n'
  for (const t of recentTraces) {
    md += `### ${t.requestId}\n`
    md += `- 时间: ${t.timestamp}\n`
    md += `- Agents: ${t.agents.join(', ')}\n`
    md += `- 输入摘要: ${t.inputsSummary}\n`
    md += `- 输出摘要: ${t.outputsSummary}\n`
    md += `- 证据: ${t.evidence.join('; ')}\n`
    md += `- 风险标记: ${t.riskFlags.length > 0 ? t.riskFlags.join(', ') : '无'}\n`
    md += `- Fallback: ${t.fallbackUsed ? '是' : '否'}\n`
    md += `- 耗时: ${t.durationMs}ms\n\n`
  }

  return md
}

export function generateDemoTraceJson() {
  const traces = getTraces(10)
  const summary = getTraceSummary()

  return {
    reportGeneratedAt: new Date().toISOString(),
    competitionTrack: 'A3 - 基于大模型的个性化资源生成与学习多智能体系统',
    summary,
    sampleTraces: traces,
      description: '本报告展示智学星枢系统中多智能体协作的完整证据链，包括画像分析、资源生成、路径规划、辅导回答、效果评估和反思反馈六个 Agent 的协作过程。',
  }
}
