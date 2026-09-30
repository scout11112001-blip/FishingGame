import { defineConfig } from 'vite'

export default defineConfig({
  // Яндекс Игры раздают игру из подпапки, поэтому все пути в сборке должны быть относительными
  base: './',
  build: {
    // Phaser сам по себе весит ~1.4 МБ (≈360 КБ в gzip) — предупреждение о большом чанке тут ожидаемо
    chunkSizeWarningLimit: 1600,
  },
})
