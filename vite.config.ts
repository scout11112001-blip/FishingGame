import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

export default defineConfig(({ mode }) => ({
  // Яндекс Игры раздают игру из подпапки, а хостинг ВК — с меняющегося адреса: все пути в сборке относительные
  base: './',
  build: {
    // Phaser сам по себе весит ~1.4 МБ (≈360 КБ в gzip) — предупреждение о большом чанке тут ожидаемо
    chunkSizeWarningLimit: 1600,
  },
  // На хостинге ВК аудиофайлы запрещены: в сборку для ВК (npm run build:vk) звуки не кладём — игра там без звука
  plugins: mode === 'vk' ? [dropFolder('audio')] : [],
}))

/** Убрать папку из готовой сборки: public/ Vite копирует целиком, а выборочно исключать не умеет. */
function dropFolder(name: string): Plugin {
  let outDir = ''
  return {
    name: 'drop-folder',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      rmSync(resolve(outDir, name), { recursive: true, force: true })
    },
  }
}
