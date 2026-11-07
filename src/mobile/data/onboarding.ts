import {
  roleOptions, fieldOptions, levelOptions, experienceOptions, goalOptions,
  longTermGoalOptions, motivationOptions, timeOptions, resourceOptions,
  weeklyHourOptions, paceOptions, type SurveyAnswers,
} from '@/composables/useProfileSurvey'
export type DimensionKey = 'knowledgeBase' | 'learningSpeed' | 'logicalThinking' | 'creativity' | 'focus' | 'selfDiscipline'
export type NeedsKey = Exclude<keyof SurveyAnswers, DimensionKey>
export const dimensions: Array<{ key: DimensionKey; label: string }> = [
  { key: 'knowledgeBase', label: '知识基础' }, { key: 'learningSpeed', label: '学习速度' },
  { key: 'logicalThinking', label: '逻辑思维' }, { key: 'creativity', label: '创造力' },
  { key: 'focus', label: '专注力' }, { key: 'selfDiscipline', label: '自律力' },
]
export const needsFields: Array<{ key: NeedsKey; label: string; options: Array<{ value: string; label: string }>; step: number }> = [
  { key: 'role', label: '你目前的学习阶段或身份', options: roleOptions, step: 0 },
  { key: 'field', label: '想学习的方向', options: fieldOptions, step: 0 },
  { key: 'level', label: '目前的基础', options: levelOptions, step: 0 },
  { key: 'experience', label: '相关学习或实践经历', options: experienceOptions, step: 0 },
  { key: 'shortTermGoal', label: '近期想完成什么', options: goalOptions, step: 1 },
  { key: 'longTermGoal', label: '更长远的目标', options: longTermGoalOptions, step: 1 },
  { key: 'motivation', label: '是什么让你想开始学习', options: motivationOptions, step: 1 },
  { key: 'weeklyHours', label: '每周可以投入多少时间', options: weeklyHourOptions, step: 3 },
  { key: 'bestTime', label: '习惯在哪个时段学习', options: timeOptions, step: 3 },
  { key: 'resourcePreference', label: '更喜欢哪种学习方式', options: resourceOptions, step: 3 },
  { key: 'learningPace', label: '希望以怎样的节奏推进', options: paceOptions, step: 3 },
]
export function newAnswers(): SurveyAnswers {
  return {
    role: '', field: '', customField: '', level: '', experience: '', shortTermGoal: '', shortTermDetail: '', longTermGoal: '', motivation: '',
    knowledgeBase: 50, learningSpeed: 50, logicalThinking: 50, creativity: 50, focus: 50, selfDiscipline: 50,
    bestTime: '', resourcePreference: '', weeklyHours: '', learningPace: '',
  }
}
export function stepIsValid(answers: SurveyAnswers, step: number): boolean {
  return needsFields.filter(field => field.step === step).every(field => field.options.some(option => option.value === answers[field.key]))
    && (step !== 0 || answers.field !== 'other' || Boolean(answers.customField.trim()))
    && (step !== 1 || Boolean(answers.shortTermDetail.trim()))
    && (step !== 2 || dimensions.every(dim => Number.isFinite(answers[dim.key]) && answers[dim.key] >= 0 && answers[dim.key] <= 100))
}
