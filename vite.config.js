import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ВАЖНО: Делаем код совместимым со старыми браузерами
    target: ['es2015', 'chrome60', 'safari11'],
    outDir: 'dist',
  },
  server: {
    host: true // Позволяет тестировать с телефона в локальной сети
  }
})