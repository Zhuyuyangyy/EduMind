function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function applyProfileUpdates(profile = {}, evaluation = {}) {
  const adjustments = evaluation.profileUpdates?.adjustDimensions || []
  const dimensions = (profile.dimensions || []).map(item => ({ ...item }))
  const radarPoints = (profile.radarPoints || []).map(item => ({ ...item }))
  const changes = []

  for (const adjustment of adjustments) {
    const dimension = dimensions.find(item => item.label === adjustment.dimension || item.key === adjustment.dimension)
    const radarPoint = radarPoints.find(item => item.dimension === adjustment.dimension)
    if (!dimension && !radarPoint) continue

    const before = Number(dimension?.value ?? radarPoint?.score ?? 0)
    const delta = clamp(Number(adjustment.delta) || 0, -8, 6)
    const after = clamp(before + delta)
    if (dimension) dimension.value = after
    if (radarPoint) radarPoint.score = after
    changes.push({
      dimension: adjustment.dimension,
      before,
      delta,
      after,
      reason: adjustment.reason || '评估证据触发画像更新',
    })
  }

  const values = dimensions.map(item => Number(item.value)).filter(Number.isFinite)
  const totalScore = values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : Number(profile.totalScore ?? profile.score ?? 0)
  let weaknesses = Array.isArray(profile.weaknesses) ? [...profile.weaknesses] : []
  for (const change of changes) {
    if (change.after >= 70) {
      weaknesses = weaknesses.filter(item => !String(item?.tag || item?.label || item).includes(change.dimension))
    } else if (change.delta < 0 && !weaknesses.some(item => String(item?.tag || item?.label || item).includes(change.dimension))) {
      weaknesses.push(`${change.dimension}需补强`)
    }
  }

  return {
    profile: {
      ...profile,
      dimensions,
      radarPoints,
      totalScore,
      score: totalScore,
      weaknesses,
      updatedAt: new Date().toISOString(),
    },
    changes,
  }
}
