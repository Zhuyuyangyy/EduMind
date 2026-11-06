import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200
  },
  preview: {
    port: 4173,
    strictPort: true
  }
})
