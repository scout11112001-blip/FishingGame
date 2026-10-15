import { CloudStore, CLOUD_KEY, LocalStore, MirrorStore, type CloudPlayer, type SaveStore } from '../save/store.ts'
import type { Platform } from './platform.ts'

// ВКонтакте и Одноклассники — через VK Bridge, строго по документации: https://dev.vk.com/ru/games/overview
// Реклама: .../games/monetization/ad/implementation; хранилище: .../bridge/VKWebAppStorageSet;
// сворачивание: .../games/how-to/handle-minimize-and-restore-events; параметры запуска: .../games/development/parameters.

/** То, что нужно от VK Bridge: отправить событие и подписаться на события. Подменяется в тестах. */
export interface VkBridge {
  send(method: string, props?: Record<string, unknown>): Promise<unknown>
  subscribe(listener: (event: { detail?: { type?: string } }) => void): void
}

/**
 * Длиннее хранилище ВК значение не принимает: «сохраняются только первые 4096 символов, для сериализованной
 * строки — 2236». Сохранение — JSON, поэтому берём меньшее. Обрезанный JSON — потерянный прогресс, так что
 * длиннее просто не пишем (наше сохранение — около 1,3 КБ, тест следит, чтобы оно не разрослось).
 */
export const VK_VALUE_MAX = 2236
/** Сколько ждать ответа хранилища при запуске: дольше — играем с копией из браузера. */
const LOAD_TIMEOUT_MS = 4000

/**
 * Облачное сохранение ВК (VKWebAppStorageSet/Get): значения привязаны к игроку, а не к устройству — прогресс
 * общий для телефона и компьютера, как требуют правила ВК (п. 2.3.8). Очередь и частоту записи ведёт CloudStore.
 */
export class VkCloud implements CloudPlayer {
  private readonly bridge: VkBridge
  private readonly prefix: string

  /** prefix — ключ сохранения игры («fishing:rivers»): в ключах хранилища ВК можно только латиницу, цифры, _ и -. */
  constructor(bridge: VkBridge, prefix: string) {
    this.bridge = bridge
    this.prefix = vkKey(prefix)
  }

  async getData(keys: string[]): Promise<Record<string, unknown>> {
    const names = keys.map((k) => this.name(k))
    const result = (await withTimeout(this.bridge.send('VKWebAppStorageGet', { keys: names }), LOAD_TIMEOUT_MS)) as {
      keys?: { key: string; value: string }[]
    }
    const data: Record<string, unknown> = {}
    for (const k of keys) {
      const value = result.keys?.find((e) => e.key === this.name(k))?.value
      // Пустая строка — ключа нет (так ВК удаляет значение)
      if (value) data[k] = value
    }
    return data
  }

  /** Как у Яндекса: данные заменяются целиком — чего нет в data, то стирается (пустое значение удаляет ключ ВК). */
  async setData(data: Record<string, unknown>): Promise<void> {
    const value = data[CLOUD_KEY]
    const json = typeof value === 'string' ? value : ''
    if (json.length > VK_VALUE_MAX) throw new Error(`сохранение длиннее ${VK_VALUE_MAX} символов — в хранилище ВК не влезет`)
    await this.bridge.send('VKWebAppStorageSet', { key: this.name(CLOUD_KEY), value: json })
  }

  private name(key: string): string {
    return vkKey(`${this.prefix}_${key}`)
  }
}

export interface VkPlatformOptions {
  /** Время запуска от ВК (параметр vk_ts), секунды; нет — часы устройства. */
  launchTime: number | null
  supportUrl: string | null
  /** Часы, мс. Подменяются в тестах. */
  clock?: () => number
  storage?: () => Storage
}

export class VkPlatform implements Platform {
  readonly name = 'vk'
  readonly sounds = false
  readonly rewardedAds = true
  readonly supportUrl: string | null
  private readonly bridge: VkBridge
  private readonly clock: () => number
  private readonly storage: () => Storage
  /** Насколько время ВК при запуске расходится с часами устройства: прибавляем к ним — получаем время ВК. */
  private readonly offset: number
  private readonly pauseListeners: ((paused: boolean) => void)[] = []
  private adShowing = false
  /** Игру свернули в мобильном приложении ВК (VKWebAppViewHide). На сайтах свёрнутую вкладку Phaser ставит на паузу сам. */
  private hidden = false
  private paused = false

  constructor(bridge: VkBridge, options: VkPlatformOptions) {
    this.bridge = bridge
    this.supportUrl = options.supportUrl
    this.clock = options.clock ?? Date.now
    this.storage = options.storage ?? (() => window.localStorage)
    this.offset = options.launchTime ? options.launchTime * 1000 - this.clock() : 0
    bridge.subscribe((event) => {
      const type = event.detail?.type
      if (type === 'VKWebAppViewHide') this.setHidden(true)
      else if (type === 'VKWebAppViewRestore') this.setHidden(false)
    })
    this.preloadRewarded()
  }

  /** VKWebAppInit уже отправлен при запуске (loadPlatform) — до загрузки картинок, как требует ВК. */
  ready(): void {}

  /** Разметки геймплея у ВК нет. */
  setGameplay(): void {}

  onPause(listener: (paused: boolean) => void): void {
    this.pauseListeners.push(listener)
  }

  /**
   * Межстраничную рекламу ВК разрешает только во время явной загрузки — следующего уровня или локации (п. 5.1.5.1).
   * Закрытие экрана улова — не загрузка, поэтому здесь её нет; доход во ВК — от рекламы за награду.
   */
  async showFullscreenAd(): Promise<void> {}

  /**
   * Реклама за награду: true — ВК сообщил, что показал её. Только по нажатию игрока на кнопку с названной наградой
   * (п. 5.1.5.1), одна за раз. Пока она идёт, игра стоит. После показа ВК сам подгружает следующую — дёргаем
   * VKWebAppCheckNativeAds ещё раз на случай, если первая подгрузка не удалась.
   */
  async showRewardedAd(): Promise<boolean> {
    if (this.adShowing) return false
    this.adShowing = true
    this.syncPause()
    try {
      const result = (await this.bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' })) as { result?: boolean } | undefined
      return result?.result === true
    } catch {
      // Нет рекламы (ошибка 20), нет сети, отказ клиента — награды нет
      return false
    } finally {
      this.adShowing = false
      this.syncPause()
      this.preloadRewarded()
    }
  }

  now(): number {
    return this.clock() + this.offset
  }

  /**
   * Прогресс — в браузере и в хранилище ВК, при загрузке — более свежая копия. На хостинге ВК адрес игры меняется
   * с каждой выкладкой, и localStorage прошлой версии пропадает: настоящая копия — облачная.
   */
  saveStore(key: string): SaveStore {
    return new MirrorStore(new LocalStore(key, this.storage), new CloudStore(new VkCloud(this.bridge, key)))
  }

  /** Подгрузить рекламу за награду заранее: без этого показ начинается с задержкой (так советует документация ВК). */
  private preloadRewarded() {
    this.bridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward' }).catch(() => {})
  }

  private setHidden(hidden: boolean) {
    this.hidden = hidden
    this.syncPause()
  }

  /** Пауза — пока игра свёрнута или идёт реклама. Слушателям — только смену. */
  private syncPause() {
    const paused = this.hidden || this.adShowing
    if (paused === this.paused) return
    this.paused = paused
    for (const l of this.pauseListeners) l(paused)
  }
}

/** Ключ хранилища ВК: [a-zA-Z_\-0-9], не длиннее 100 символов. */
export function vkKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error('ВК не ответил')), ms)))
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}
