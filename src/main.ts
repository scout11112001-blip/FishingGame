import Phaser from 'phaser'
import './style.css'
import { ACTIVE_PACK } from './content/index.ts'
import { PlayerState } from './content/player.ts'
import { DEBUG } from './debug.ts'
import { SANDBOX } from './sandbox.ts'
import { loadPlatform } from './platform/load.ts'
import { AutoSaver, loadInto } from './save/autosave.ts'
import { FishingScene } from './scenes/FishingScene.ts'
import { setLoadProgress } from './ui/loader.ts'

/**
 * Во сколько раз холст детальнее CSS-пикселей. На телефонах экран в 2–3 раза плотнее обычного, и холст
 * в CSS-пикселях браузер растягивает — картинка и текст мылятся. Выше 2 разница почти не видна, а рисовать дороже.
 */
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2)

// Своё сохранение у каждой обёртки, а у тестовой версии — отдельное: открытый контент не портит настоящий прогресс
// Яндекс Игры (SDK) или просто браузер — до всего остального: от площадки зависит, где хранится прогресс
const platform = await loadPlatform()
setLoadProgress(0.12)
const store = platform.saveStore(`fishing:${ACTIVE_PACK.id}${SANDBOX ? ':sandbox' : ''}`)
const player = new PlayerState(ACTIVE_PACK, { unlockAll: SANDBOX })
// Прогресс грузится до запуска сцены: игра сразу стартует с ним
await loadInto(player, store, platform.now())
setLoadProgress(0.2)

// Время записи — по часам площадки: у копий с разных устройств они общие, у самих устройств — нет
const saver = new AutoSaver(store, player, () => platform.now())
saver.start()
// Свернули или закрыли — пишем сразу, не дожидаясь проверки по таймеру
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saver.flush(true))
window.addEventListener('pagehide', () => saver.flush(true))
// И когда площадка ставит игру на паузу: в приложении ВК свёрнутую игру видно только по VKWebAppViewHide
platform.onPause((paused) => paused && saver.flush(true))

// Отладка: из консоли браузера __resetSave() стирает прогресс и перезапускает игру
if (DEBUG) {
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
  scene: [new FishingScene(player, platform)],
})
// Отладка: игра и площадка доступны из консоли браузера как __game и __platform
if (DEBUG) Object.assign(window, { __game: game, __platform: platform })

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
