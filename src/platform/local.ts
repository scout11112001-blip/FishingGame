import { LocalStore } from '../save/store.ts'
import type { Platform } from './platform.ts'

/**
 * Без Яндекса: сервер разработки или чужой хостинг. Рекламы нет, сохранение — только в браузере,
 * паузу при сворачивании вкладки и так делает сам Phaser.
 */
export class LocalPlatform implements Platform {
  readonly name = 'local'
  readonly rewardedAds = false

  ready(): void {}

  setGameplay(): void {}

  onPause(): void {}

  async showFullscreenAd(): Promise<void> {}

  async showRewardedAd(): Promise<boolean> {
    return false
  }

  now(): number {
    return Date.now()
  }

  saveStore(key: string): LocalStore {
    return new LocalStore(key, () => window.localStorage)
  }
}
