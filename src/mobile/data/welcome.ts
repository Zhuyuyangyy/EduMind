import { ref } from 'vue'
import type { SurveyAnswers } from '@/composables/useProfileSurvey'
import { needsFields } from './onboarding'
export const welcomeRequest = ref(0)
export const welcomeUpdated = ref(0)
export function requestWelcomeCards() { welcomeRequest.value++ }
export interface WelcomeRecord {
  version: number
  status: 'completed' | 'skipped'
  answers: Partial<SurveyAnswers>
  updatedAt: string
}

export function welcomeFieldLabel(answers: Partial<SurveyAnswers>): string {
  return answers.field === 'other' ? answers.customField?.trim() || '你感兴趣的方向'
    : needsFields.find(field => field.key === 'field')?.options.find(option => option.value === answers.field)?.label || '你感兴趣的方向'
}

export function welcomeGoalLabel(answers: Partial<SurveyAnswers>): string {
  return answers.shortTermDetail?.trim()
    || needsFields.find(field => field.key === 'shortTermGoal')?.options.find(option => option.value === answers.shortTermGoal)?.label || '从一个小目标开始'
}
