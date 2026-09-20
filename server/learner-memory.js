function compactMastery(mastery = []) {
  return mastery.slice(0, 5).map(item => ({
    topic: item.topic || item.dimension || item.label,
    score: item.score ?? item.mastery ?? item.value,
  }))
}

export function summarizeLearningHistory(cycles = [], limit = 5) {
  return cycles.slice(-limit).map(cycle => ({
    workflowId: cycle.workflowId,
    createdAt: cycle.createdAt,
    profileChanges: (cycle.profileChanges || []).slice(0, 6).map(change => ({
      dimension: change.dimension,
      before: change.before,
      after: change.after,
      reason: change.reason,
    })),
    mastery: compactMastery(cycle.evaluation?.mastery || []),
    pathReason: cycle.path?.replanReason || cycle.path?.reason || '',
    nextSteps: (cycle.reflection?.nextSteps || []).slice(0, 3),
  }))
}
