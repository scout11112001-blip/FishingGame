import type { SaveStore } from '../save/store.ts'

/**
 * Площадка, на которой запущена игра: Яндекс Игры (SDK) или «просто браузер» — сервер разработки, чужой хостинг.
 * Игра знает только этот интерфейс; что под ним — решает loadPlatform при запуске.
 */
export interface Platform {
  readonly name: 'yandex' | 'local'
  /** Игра загрузилась и готова к нажатиям — LoadingAPI.ready. Звать один раз. */
  ready(): void
  /** Идёт ли сейчас игровой процесс — GameplayAPI.start/stop. Можно звать каждый кадр: площадка шлёт только смену. */
  setGameplay(active: boolean): void
  /** Площадка ставит игру на паузу и снимает с неё: реклама, окно покупки, свернули вкладку. */
  onPause(listener: (paused: boolean) => void): void
  /** Межстраничная реклама в логической паузе. Не чаще своего интервала — слишком частый вызов просто ничего не делает. */
  showFullscreenAd(): Promise<void>
  /** Есть ли реклама за награду: без неё кнопки «за рекламу» видны, но не нажимаются. */
  readonly rewardedAds: boolean
  /** Реклама за награду: true — досмотрел, награду можно выдавать. */
  showRewardedAd(): Promise<boolean>
  /** Текущее время, мс. На Яндексе — серверное: перевод часов на устройстве на него не влияет. */
  now(): number
  /** Где хранить прогресс под ключом key. */
  saveStore(key: string): SaveStore
}
