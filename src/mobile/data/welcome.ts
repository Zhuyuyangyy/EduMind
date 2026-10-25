import { ref } from 'vue'
import type { SurveyAnswers } from '@/composables/useProfileSurvey'
export const welcomeRequest = ref(0)
export function requestWelcomeCards() { welcomeRequest.value++ }
export interface WelcomeRecord {
  version: number
  status: 'completed' | 'skipped'
  answers: Partial<SurveyAnswers>
  updatedAt: string
}
