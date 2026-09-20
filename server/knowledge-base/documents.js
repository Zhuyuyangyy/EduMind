export const LOCAL_KNOWLEDGE_DOCUMENTS = [
  {
    id: 'kb-eval-pointer-aliasing',
    domain: 'programming-memory',
    source: 'local',
    title: 'Pointer aliasing assessment rubric',
    type: 'rubric',
    tags: ['pointer', 'memory', 'c', 'weakness', 'assessment'],
    summary: 'Use address diagrams and step tracing when students confuse pointer variable updates with pointee value updates.',
    content:
      'When a learner misses pointer aliasing questions, the evaluation agent should check whether the error came from pointer level confusion, address lifetime, or missing call-stack reasoning. Recommended remediation: a memory-grid diagram, swap/createNode comparison, and 4 to 6 trace exercises.',
    agentHint:
      'If pointer mastery is below 60, lower the related profile dimension slightly and insert a pointer trace remediation node into the next learning path.',
  },
  {
    id: 'kb-eval-bfs-visited',
    domain: 'graph-algorithms',
    source: 'local',
    title: 'BFS visited marking diagnosis',
    type: 'diagnosis',
    tags: ['graph', 'bfs', 'visited', 'queue', 'assessment'],
    summary: 'Repeated visits usually indicate that the learner marks visited too late or lacks a stable queue-state model.',
    content:
      'For BFS errors, compare the learner answer against the invariant: each node should be marked when enqueued in the standard traversal template. If the learner marks after dequeue, flag queue-state confusion and recommend animation snapshots plus targeted visited-timing exercises.',
    agentHint:
      'Use BFS visited timing as a high-priority weakness when graph search accuracy is below 65 or exerciseResults mention duplicate traversal.',
  },
  {
    id: 'kb-eval-resource-completion',
    domain: 'learning-evidence',
    source: 'local',
    title: 'Resource completion evidence weighting',
    type: 'policy',
    tags: ['resource', 'completion', 'evidence', 'profile'],
    summary: 'Resource completion should support, not replace, exercise evidence in mastery updates.',
    content:
      'Evaluation should weight exercise correctness first, then resource completion, then tutoring dialogue signals. High completion with low correctness indicates passive review and should trigger active-recall resources. Low completion with high correctness can be treated as efficient mastery.',
    agentHint:
      'Mention evidence source balance in profileUpdates.reason so the ReflectionAgent can explain why the profile changed.',
  },
  {
    id: 'kb-eval-profile-backprop',
    domain: 'learner-profile',
    source: 'local',
    title: 'Profile back-propagation rule',
    type: 'rule',
    tags: ['profile', 'backprop', 'mastery', 'reflection'],
    summary: 'Profile updates should be small, evidence-bound, and reversible in later rounds.',
    content:
      'Update a profile dimension by -3 to -8 for repeated weak evidence, +2 to +6 for stable improvement, and avoid large jumps unless there are multiple independent signals. Include the dimension, delta, and plain-language reason for every adjustment.',
    agentHint:
      'Return profileUpdates.adjustDimensions with bounded deltas and evidence-aware reasons for downstream agents.',
  },
  {
    id: 'kb-eval-path-replan',
    domain: 'path-planning',
    source: 'vector',
    title: 'Evaluation to path replan handoff',
    type: 'handoff',
    tags: ['path', 'replan', 'agent', 'handoff'],
    summary: 'The evaluation agent should emit weaknesses in a form the path agent can convert into remedial path nodes.',
    content:
      'For each weak concept, provide concept name, observed issue, root cause, resource preference, and path impact. The PathAgent can then insert a short remediation node before the next dependent concept and remove mastered review nodes.',
    agentHint:
      'Shape suggestions as actionable path changes, not only report text, so PathAgent and ReflectionAgent can coordinate.',
  },
  {
    id: 'kb-eval-active-recall',
    domain: 'learning-strategy',
    source: 'vector',
    title: 'Active recall remediation strategy',
    type: 'strategy',
    tags: ['exercise', 'active-recall', 'remediation', 'resource'],
    summary: 'Weak concepts should map to short active-recall loops before long-form content review.',
    content:
      'When mastery is weak, recommend a 15 to 25 minute loop: quick concept card, one worked example, three retrieval questions, and one transfer task. This works better than only rereading notes for algorithm and programming topics.',
    agentHint:
      'Prefer exercise and trace resources for low-correctness weaknesses, and reserve documents for conceptual gaps.',
  },
]
