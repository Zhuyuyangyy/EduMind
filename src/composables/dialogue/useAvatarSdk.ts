import { ref, shallowRef } from 'vue'

const API_INFO = {
  // Long-lived avatar credentials must never be shipped to the browser.
  // Keep the feature disabled until the backend can issue a short-lived session.
  serverUrl: '',
  appId: '',
  apiKey: '',
  apiSecret: '',
  sceneId: '',
}

const PREFERRED_AVATAR_ID = '110117005'
const FALLBACK_AVATAR_ID = '111188001'

function createGlobalConfig(avatarId: string) {
  return {
    stream: { protocol: 'xrtc' as const, alpha: 1, bitrate: 1000000, fps: 25 as const },
    avatar: { avatar_id: avatarId, width: 720, height: 1280, scale: 1, move_h: 0, move_v: 0, audio_format: 1 as const },
    tts: { vcn: 'x4_yuexiaoni_assist', speed: 50, pitch: 50, volume: 100 },
    avatar_dispatch: { interactive_mode: 0 as const, content_analysis: 0 as const },
  }
}

export const avatarStatus = ref<'idle' | 'loading' | 'connected' | 'error'>('idle')
export const avatarSubtitle = ref('')
export const avatarError = ref<string | null>(null)
export const playNotAllowed = ref(false)

let onNlpResult: ((data: any) => void) | null = null
let onAsrResult: ((data: any) => void) | null = null

export function setAvatarNlpHandler(handler: (data: any) => void) {
  onNlpResult = handler
}

export function setAvatarAsrHandler(handler: (data: any) => void) {
  onAsrResult = handler
}

const sdkRef = shallowRef<any>(null)
let autoStarted = false

async function getSdkModule(): Promise<any> {
  return import('@/sdk/index.js')
}

function getMissingApiInfoFields() {
  return [
    ['APPID', API_INFO.appId],
    ['APIKey', API_INFO.apiKey],
    ['APISecret', API_INFO.apiSecret],
    ['接口服务ID', API_INFO.sceneId],
  ].filter(([, value]) => !value).map(([label]) => label)
}

function isAvatarAuthError(error: any) {
  return String(error?.message || error).toLowerCase().includes('avatar authentication failed')
}

export async function initAvatar(wrapperEl: HTMLElement): Promise<boolean> {
  if (autoStarted) return true
  avatarStatus.value = 'loading'
  avatarError.value = null

  try {
    const missingFields = getMissingApiInfoFields()
    if (missingFields.length > 0) {
      throw new Error(`缺少虚拟人配置：${missingFields.join('、')}`)
    }

    const sdkModule = await getSdkModule()
    const AvatarPlatform = sdkModule.default || sdkModule

    const instance = new AvatarPlatform({ useInlinePlayer: true })
    sdkRef.value = instance

    instance.setApiInfo(API_INFO)
    instance.setGlobalParams(createGlobalConfig(PREFERRED_AVATAR_ID))

    instance.removeAllListeners()
    instance
      .on('connected', () => {
        avatarStatus.value = 'connected'
      })
      .on('disconnected', (e: any) => {
        avatarStatus.value = 'idle'
        autoStarted = false
        if (e) console.error('[Avatar] disconnected', e.code, e.message)
      })
      .on('asr', (data: any) => {
        if (onAsrResult) onAsrResult(data)
      })
      .on('nlp', (data: any) => {
        if (onNlpResult) onNlpResult(data)
      })
      .on('subtitle_info', (data: any) => {
        avatarSubtitle.value = data?.text || ''
      })
      .on('error', (error: any) => {
        console.error('[Avatar] error', error)
      })

    const player = instance.player || instance.createPlayer()
    player
      .on('not-allowed', () => {
        playNotAllowed.value = true
      })

    try {
      await instance.start({ wrapper: wrapperEl })
    } catch (startError) {
      if (!isAvatarAuthError(startError)) throw startError

      console.warn(`[Avatar] avatar ${PREFERRED_AVATAR_ID} is not authorized for this scene, retrying ${FALLBACK_AVATAR_ID}`)
      try { instance.stop?.() } catch { /* ignore */ }
      instance.setGlobalParams(createGlobalConfig(FALLBACK_AVATAR_ID))
      await instance.start({ wrapper: wrapperEl })
    }

    autoStarted = true
    playNotAllowed.value = false
    return true
  } catch (e: any) {
    console.error('[Avatar] init failed:', e)
    avatarError.value = e?.message || '虚拟人启动失败'
    avatarStatus.value = 'error'
    autoStarted = false
    return false
  }
}

export async function avatarWriteText(text: string, nlp = true) {
  const sdk = sdkRef.value
  if (!sdk) return
  try {
    await sdk.writeText(text, {
      nlp,
      avatar_dispatch: { interactive_mode: 0, content_analysis: 0 },
    })
  } catch (e) {
    console.error('[Avatar] writeText error:', e)
  }
}

export async function avatarInterrupt() {
  const sdk = sdkRef.value
  if (!sdk) return
  try {
    await sdk.interrupt()
  } catch (e) {
    console.error('[Avatar] interrupt error:', e)
  }
}

export const isRecording = ref(false)

export async function avatarStartRecord(duration = 0) {
  const sdk = sdkRef.value
  if (!sdk) return
  try {
    const recorder = sdk.recorder || sdk.createRecorder()
    recorder.on('error', () => {
      isRecording.value = false
    })
    await recorder.startRecord(duration, () => {
      isRecording.value = false
    })
    isRecording.value = true
  } catch (e) {
    console.error('[Avatar] startRecord error:', e)
    isRecording.value = false
  }
}

export function avatarStopRecord() {
  const sdk = sdkRef.value
  if (!sdk) return
  try {
    const recorder = sdk.recorder
    if (recorder) {
      recorder.stopRecord()
      isRecording.value = false
    }
  } catch (e) {
    console.error('[Avatar] stopRecord error:', e)
  }
}

export async function avatarWriteCmd(actionId: string) {
  const sdk = sdkRef.value
  if (!sdk) return
  try {
    await sdk.writeCmd('action', actionId)
  } catch (e) {
    console.error('[Avatar] writeCmd error:', e)
  }
}

export function avatarResize() {
  try { sdkRef.value?.player?.resize() } catch { /* ignore */ }
}

export function avatarStop() {
  try { sdkRef.value?.stop() } catch { /* ignore */ }
  autoStarted = false
  avatarStatus.value = 'idle'
}

export function avatarDestroy() {
  try { sdkRef.value?.destroy() } catch { /* ignore */ }
  sdkRef.value = null
  autoStarted = false
  avatarStatus.value = 'idle'
}

export function avatarResume() {
  try { sdkRef.value?.player?.resume() } catch { /* ignore */ }
  playNotAllowed.value = false
}

export function getAvatarInstance() {
  return sdkRef.value
}

export function setAvatarVolume(v: number) {
  const player = sdkRef.value?.player
  if (player) player.volume = v / 100
}

export function setAvatarMuted(muted: boolean) {
  const player = sdkRef.value?.player
  if (player) player.muted = muted
}
