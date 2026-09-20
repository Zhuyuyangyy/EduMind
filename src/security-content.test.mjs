import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('client source contains no known exposed avatar credentials or personal profile data', async () => {
  const files = [
    'src/composables/dialogue/useAvatarSdk.ts',
    'src/components/edu-mind/Header.vue',
    'src/components/edu-mind/SettingsView.vue',
  ]
  const source = (await Promise.all(files.map(file => readFile(path.join(root, file), 'utf8')))).join('\n')

  assert.doesNotMatch(source, /46d88496fc86492253ba9355584dde23/)
  assert.doesNotMatch(source, /OTMwYTQ3ZjQ5ZTI5ODdhZGNjNjIwOTA2/)
  assert.doesNotMatch(source, /liuhongwei4138@gmail\.com/)
  assert.doesNotMatch(source, /清华大学/)
})

test('document title uses the 智学星枢 brand and does not claim unsupported availability', async () => {
  const index = await readFile(path.join(root, 'index.html'), 'utf8')
  const login = await readFile(path.join(root, 'src/components/login/LoginPanel.vue'), 'utf8')

  assert.match(index, /<title>智学星枢/)
  assert.doesNotMatch(login, /99\.9%/)
})
