import Phaser from 'phaser'
import './style.css'
import { ACTIVE_PACK } from './content/index.ts'
import { PlayerState } from './content/player.ts'
import { SANDBOX } from './sandbox.ts'
import { AutoSaver, loadInto } from './save/autosave.ts'
import { LocalStore } from './save/store.ts'
import { FishingScene } from './scenes/FishingScene.ts'

/**
 * Во сколько раз холст детальнее CSS-пикселей. На телефонах экран в 2–3 раза плотнее обычного, и холст
 * в CSS-пикселях браузер растягивает — картинка и текст мылятся. Выше 2 разница почти не видна, а рисовать дороже.
 */
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2)

// Своё сохранение у каждой обёртки, а у тестовой версии — отдельное: открытый контент не портит настоящий прогресс
const store = new LocalStore(`fishing:${ACTIVE_PACK.id}${SANDBOX ? ':sandbox' : ''}`)
const player = new PlayerState(ACTIVE_PACK, { unlockAll: SANDBOX })
// Прогресс грузится до запуска сцены: игра сразу стартует с ним
await loadInto(player, store, Date.now())

const saver = new AutoSaver(store, player)
saver.start()
// Свернули или закрыли — пишем сразу, не дожидаясь проверки по таймеру
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saver.flush())
window.addEventListener('pagehide', () => saver.flush())

// Отладка: в dev-сборке из консоли браузера __resetSave() стирает прогресс и перезапускает игру
if (import.meta.env.DEV) {
  Object.assign(window, {
    __resetSave: async () => {
      saver.disable()
      await store.clear()
      location.reload()
    },
  })
}

const parent = document.getElementById('game')!
const ratio = pixelRatio()

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0b2a3a',
  scale: {
    // Холст в физических пикселях экрана, а на странице — ужат обратно до размера окна (zoom).
    // Сцены рисуют в CSS-пикселях: камера увеличивает всё в ratio раз.
    mode: Phaser.Scale.NONE,
    width: parent.clientWidth * ratio,
    height: parent.clientHeight * ratio,
    zoom: 1 / ratio,
  },
  scene: [new FishingScene(player)],
})

// Сами подгоняем холст под окно: и при смене размера, и при переносе окна на экран с другой плотностью
window.addEventListener('resize', () => {
  const r = pixelRatio()
  const w = parent.clientWidth
  const h = parent.clientHeight
  game.scale.setZoom(1 / r)
  game.scale.resize(w * r, h * r)
  // Phaser не обновляет стиль, если размер холста совпал с размером на странице (r = 1), — задаём явно.
  // И пересчитываем границы холста: по ним Phaser переводит координаты касания в координаты игры,
  // а запомнил он их до смены стиля — иначе клики промахиваются.
  game.canvas.style.width = `${w}px`
  game.canvas.style.height = `${h}px`
  game.scale.refresh()
})

// Чтобы тестовую вкладку не спутать с обычной
if (SANDBOX) document.title += ' — тест'
