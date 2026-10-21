export type MasteryRange = 'none' | 'weak' | 'beginner' | 'basic' | 'proficient' | 'mastered'
export type AgentType = 'profile' | 'planning' | 'action' | 'reflection' | 'evaluation'

export interface AgentEvidence {
  agentType: AgentType
  agentName: string
  evidenceType: 'behavior' | 'reflection' | 'task_result' | 'assessment' | 'plan'
  count: number
  samples?: string[]
}

export interface KnowledgePoint {
  id: string
  name: string
  module: string
  unit?: string
  parentId?: string
  mastery: number
  previousMastery: number
  confidence: number
  weight: number
  status: MasteryRange
  recentChange: number
  agentEvidence: AgentEvidence[]
  evidenceCount: number
  prerequisiteIds: string[]
  relatedIds: string[]
  lastEvaluatedAt: string
  recommendation?: string
  issue?: string
  recentError?: string
  reasonAnalysis?: string
}

export interface KnowledgeUnit {
  id: string
  name: string
  module: string
  avgMastery: number
  points: KnowledgePoint[]
}

export interface KnowledgeModule {
  id: string
  name: string
  color: string
  agentColor: string
  avgMastery: number
  units: KnowledgeUnit[]
}

export interface CapabilityMetric {
  key: string
  label: string
  value: number
  previousValue: number
}

export interface AgentContribution {
  agentType: AgentType
  agentName: string
  color: string
  behaviorEvidence: number
  reflectionEvidence: number
  taskResultEvidence: number
  assessmentEvidence: number
}

export interface WeakPointItem {
  id: string
  name: string
  module: string
  mastery: number
  confidence: number
  issue: string
  action: string
}

export interface TrendPoint {
  date: string
  mastery: number
}

export interface EvaluationTreeData {
  learnerName: string
  courseName: string
  evaluatedAt: string
  status: 'analyzing' | 'completed' | 'no-data' | 'unavailable' | 'error'
  dataSource: 'real' | 'demo-fixture'
  overallMastery: number
  previousOverallMastery: number
  modules: KnowledgeModule[]
  capabilities: CapabilityMetric[]
  weakPoints: WeakPointItem[]
  agentContributions: AgentContribution[]
  agentConclusion: string
  trends: TrendPoint[]
}

export interface AppleRenderData {
  point: KnowledgePoint
  position: { x: number; y: number; z: number }
  branchEnd: { x: number; y: number; z: number }
  size: number
  color: string
  emissive: string
  unitId: string
  moduleId: string
}

export interface BranchRenderData {
  id: string
  name: string
  moduleId: string
  parentId?: string
  points: { x: number; y: number; z: number }[]
  radius: number
  color: string
  avgMastery: number
  isMain: boolean
}

export interface AgentRenderData {
  type: AgentType
  name: string
  color: string
  position: { x: number; y: number; z: number }
}
