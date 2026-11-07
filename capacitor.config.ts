import type { CapacitorConfig } from '@capacitor/cli'

/**
 * EduMind Mobile P1（feat/mobile-v1）
 * - webDir 指向独立的移动端构建产物 dist-mobile，与网页版 dist 隔离
 * - androidScheme https：WebView 源为 https://localhost，已在服务端 CORS 白名单内
 * - API 地址不写死在配置里：运行时在 App「状态页」切换（src/lib/api-config.ts）
 */
const config: CapacitorConfig = {
  appId: 'com.zhixuexingshu.mobile',
  appName: '智学星枢',
  webDir: 'dist-mobile',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
