import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
const APP_VERSION = pkg.version || '0.0.0'
const BUILD_TIME = new Date().toISOString()

// P1 Mobile：MOBILE_BUILD=1 时只构建 mobile.html 到 dist-mobile（Capacitor webDir），
// 与网页版 dist 完全隔离，互不影响。
const isMobileBuild = process.env.MOBILE_BUILD === '1'

export default defineConfig({
  // 移动端不引用 public/ 下的任何资源（3D 贴图/Live2D/首页大图），
  // 根级关闭 publicDir，避免把 13MB 网页资产打进 APK。
  publicDir: isMobileBuild ? false : 'public',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  server: {
    port: 5174,
    fs: {
      allow: [
        resolve(__dirname),
        resolve(__dirname, '../../../GITHUB/ez-tree-1.1.0'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
      '/deepseek-api': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/deepseek-api/, ''),
      },
    },
  },
  build: {
    outDir: isMobileBuild ? 'dist-mobile' : 'dist',
    rollupOptions: {
      // HTML 产物名跟随源文件名（mobile.html），Capacitor 约定入口为 index.html，
      // 由 scripts/build-mobile.mjs 在构建后重命名。
      input: isMobileBuild
        ? { mobile: resolve(__dirname, 'mobile.html') }
        : { index: resolve(__dirname, 'index.html') },
    },
  },
  optimizeDeps: {
    exclude: ['@dgreenheck/ez-tree'],
  },
  resolve: {
    dedupe: ['three'],
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
