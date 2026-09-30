import Phaser from 'phaser'
import './style.css'
import { FishingScene } from './scenes/FishingScene.ts'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b2a3a',
  scale: {
    // Холст занимает всё окно; сцены сами раскладывают объекты под текущий размер
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [FishingScene],
})
