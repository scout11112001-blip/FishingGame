import Phaser from 'phaser'
import './style.css'
import { SANDBOX } from './sandbox.ts'
import { FishingScene } from './scenes/FishingScene.ts'

/**
 * Во сколько раз холст детальнее CSS-пикселей. На телефонах экран в 2–3 раза плотнее обычного, и холст
 * в CSS-пикселях браузер растягивает — картинка и текст мылятся. Выше 2 разница почти не видна, а рисовать дороже.
 */
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2)

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
  scene: [FishingScene],
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
