import type { Player, SDK } from 'ysdk'
import { CloudStore, LocalStore, MirrorStore, type SaveStore } from '../save/store.ts'
import type { Platform } from './platform.ts'

// Яндекс Игры — строго по документации: https://yandex.ru/dev/games/doc/ru/sdk/sdk-about
// Разметка геймплея: .../sdk/sdk-game-events; паузы: .../sdk/sdk-events; реклама: .../sdk/sdk-adv;
// данные игрока: .../sdk/sdk-player; серверное время: .../sdk/sdk-server-time.

/**
 * Межстраничная реклама — не чаще раза в столько мс. Яндекс и сам ограничивает частоту, но как именно — не пишет,
 * а слишком частый вызов отклоняет с предупреждением в консоли. Поэтому держим свой интервал: от запуска игры
 * и от последней показанной рекламы любого вида — посмотрел рекламу за награду, межстраничную пока не покажем.
 */
export const FULLSCREEN_AD_INTERVAL_MS = 5 * 60 * 1000

export class YandexPlatform implements Platform {
  readonly name = 'yandex'
  readonly rewardedAds = true
  private readonly ysdk: SDK
  private readonly player: Player | null
  private readonly safeStorage: Storage
  private gameplay: boolean | null = null
  /** Пока идёт наша реклама, геймплей стоит, даже если игра в остальном активна. */
  private adShowing = false
  private readonly pauseListeners: ((paused: boolean) => void)[] = []
  /** Монотонные часы, мс: перевод системного времени на интервал рекламы не влияет. Подменяются в тестах. */
  private readonly clock: () => number
  /** Когда последний раз открылась реклама (любая); в начале — время запуска. */
  private lastAdAt: number

  constructor(ysdk: SDK, player: Player | null, safeStorage: Storage, clock: () => number = () => performance.now()) {
    this.ysdk = ysdk
    this.player = player
    this.safeStorage = safeStorage
    this.clock = clock
    this.lastAdAt = clock()
  }

  ready(): void {
    this.ysdk.features.LoadingAPI?.ready()
  }

  setGameplay(active: boolean): void {
    const on = active && !this.adShowing
    if (on === this.gameplay) return
    this.gameplay = on
    if (on) this.ysdk.features.GameplayAPI?.start()
    else this.ysdk.features.GameplayAPI?.stop()
  }

  onPause(listener: (paused: boolean) => void): void {
    this.pauseListeners.push(listener)
    this.ysdk.on('game_api_pause', () => listener(true))
    this.ysdk.on('game_api_resume', () => listener(false))
  }

  showFullscreenAd(): Promise<void> {
    if (this.clock() - this.lastAdAt < FULLSCREEN_AD_INTERVAL_MS) return Promise.resolve()
    return new Promise((resolve) => {
      this.withAd(resolve, (done) =>
        this.ysdk.adv.showFullscreenAdv({
          callbacks: { onOpen: () => this.adOpened(), onClose: done, onError: done, onOffline: done },
        }),
      )
    })
  }

  showRewardedAd(): Promise<boolean> {
    return new Promise((resolve) => {
      // Награда — только по onRewarded: закрыл раньше времени — не досмотрел
      let rewarded = false
      this.withAd(
        () => resolve(rewarded),
        (done) =>
          this.ysdk.adv.showRewardedVideo({
            callbacks: {
              onOpen: () => this.adOpened(),
              onRewarded: () => {
                rewarded = true
              },
              onClose: done,
              onError: done,
            },
          }),
      )
    })
  }

  now(): number {
    return this.ysdk.serverTime()
  }

  /** Реклама действительно открылась — от этого момента и отсчитываем интервал межстраничной. */
  private adOpened() {
    this.lastAdAt = this.clock()
  }

  /**
   * Прогресс — и в браузере (через «безопасное хранилище» SDK: обычный localStorage в iframe на iOS сбрасывается),
   * и в облаке Яндекса, если доступны данные игрока. При загрузке берётся более свежая копия.
   */
  saveStore(key: string): SaveStore {
    const local = new LocalStore(key, () => this.safeStorage)
    return this.player ? new MirrorStore(local, new CloudStore(this.player)) : local
  }

  /**
   * Показать рекламу: на время показа геймплей стоит, а игра и звук — на паузе (требование 4.7).
   * SDK и сам присылает game_api_pause, но паузу на свою рекламу ставим сами — не полагаясь только на него.
   * done — закрыта, не показана или ошибка.
   */
  private withAd(onDone: () => void, show: (done: () => void) => void) {
    this.adShowing = true
    this.setGameplay(false)
    for (const l of this.pauseListeners) l(true)
    let finished = false
    show(() => {
      if (finished) return
      finished = true
      this.adShowing = false
      for (const l of this.pauseListeners) l(false)
      // Следующим же кадром сцена сообщит, идёт ли игра, — и геймплей вернётся
      this.gameplay = null
      onDone()
    })
  }
}
