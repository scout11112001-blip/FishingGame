import { describe, expect, it } from 'vitest'
import type { SDK } from 'ysdk'
import { FULLSCREEN_AD_INTERVAL_MS, YandexPlatform } from './yandex.ts'

type Callbacks = { onOpen?: () => void; onClose?: (wasShown?: boolean) => void; onRewarded?: () => void; onError?: () => void }

/** SDK Яндекса в памяти: записывает вызовы, рекламу «показывает» по команде теста. */
function fakeSdk() {
  const calls: string[] = []
  const ads: Callbacks[] = []
  const handlers: Record<string, () => void> = {}
  const sdk = {
    features: {
      LoadingAPI: { ready: () => calls.push('ready') },
      GameplayAPI: { start: () => calls.push('start'), stop: () => calls.push('stop') },
    },
    adv: {
      showFullscreenAdv: (o: { callbacks: Callbacks }) => ads.push(o.callbacks),
      showRewardedVideo: (o: { callbacks: Callbacks }) => ads.push(o.callbacks),
    },
    on: (event: string, h: () => void) => {
      handlers[event] = h
      return () => {}
    },
    serverTime: () => 123,
  }
  return { sdk: sdk as unknown as SDK, calls, ads, handlers }
}

const MIN = 60 * 1000

/** Площадка со своими часами: time.t — сколько мс прошло с запуска. */
function platform(sdk: SDK) {
  const time = { t: 0 }
  const p = new YandexPlatform(sdk, null, {} as Storage, () => time.t)
  return Object.assign(p, { time })
}

describe('Яндекс Игры', () => {
  it('разметка геймплея: start/stop — только при смене, LoadingAPI.ready — по готовности', () => {
    const { sdk, calls } = fakeSdk()
    const p = platform(sdk)
    p.ready()
    p.setGameplay(true)
    p.setGameplay(true)
    p.setGameplay(false)
    p.setGameplay(false)
    p.setGameplay(true)
    expect(calls).toEqual(['ready', 'start', 'stop', 'start'])
  })

  it('награда — только если реклама досмотрена (onRewarded)', async () => {
    const { sdk, ads } = fakeSdk()
    const p = platform(sdk)
    const watched = p.showRewardedAd()
    ads[0].onRewarded!()
    ads[0].onClose!()
    expect(await watched).toBe(true)

    const skipped = p.showRewardedAd()
    ads[1].onClose!()
    expect(await skipped).toBe(false)

    const failed = p.showRewardedAd()
    ads[2].onError!()
    expect(await failed).toBe(false)
  })

  it('на время рекламы геймплей стоит, игра и звук на паузе; после — всё возвращается', async () => {
    const { sdk, calls, ads } = fakeSdk()
    const p = platform(sdk)
    const pauses: boolean[] = []
    p.onPause((paused) => pauses.push(paused))
    p.setGameplay(true)

    p.time.t = FULLSCREEN_AD_INTERVAL_MS
    const shown = p.showFullscreenAd()
    // Сцена каждый кадр говорит «игра активна», но пока идёт реклама — геймплей не стартует
    p.setGameplay(true)
    expect(calls).toEqual(['start', 'stop'])
    expect(pauses).toEqual([true])

    ads[0].onClose!(true)
    await shown
    expect(pauses).toEqual([true, false])
    p.setGameplay(true)
    expect(calls).toEqual(['start', 'stop', 'start'])
  })

  it('паузы площадки (game_api_pause / resume) доходят до игры', () => {
    const { sdk, handlers } = fakeSdk()
    const p = platform(sdk)
    const pauses: boolean[] = []
    p.onPause((paused) => pauses.push(paused))
    handlers.game_api_pause()
    handlers.game_api_resume()
    expect(pauses).toEqual([true, false])
  })

  it('межстраничная — не раньше 5 минут от запуска и не чаще раза в 5 минут', async () => {
    const { sdk, ads } = fakeSdk()
    const p = platform(sdk)
    p.time.t = 4 * MIN
    await p.showFullscreenAd()
    expect(ads).toHaveLength(0)

    p.time.t = 5 * MIN
    const shown = p.showFullscreenAd()
    ads[0].onOpen!()
    ads[0].onClose!(true)
    await shown
    expect(ads).toHaveLength(1)

    p.time.t = 9 * MIN
    await p.showFullscreenAd()
    expect(ads).toHaveLength(1)
    p.time.t = 10 * MIN
    void p.showFullscreenAd()
    expect(ads).toHaveLength(2)
  })

  it('реклама за награду сдвигает межстраничную: только что смотрел — пока не покажем', async () => {
    const { sdk, ads } = fakeSdk()
    const p = platform(sdk)
    p.time.t = 6 * MIN
    const rewarded = p.showRewardedAd()
    ads[0].onOpen!()
    ads[0].onRewarded!()
    ads[0].onClose!()
    await rewarded

    p.time.t = 8 * MIN
    await p.showFullscreenAd()
    expect(ads).toHaveLength(1)
    p.time.t = 11 * MIN
    void p.showFullscreenAd()
    expect(ads).toHaveLength(2)
  })

  it('не показанная (Яндекс отклонил) межстраничная интервал не сбрасывает', async () => {
    const { sdk, ads } = fakeSdk()
    const p = platform(sdk)
    p.time.t = 5 * MIN
    const refused = p.showFullscreenAd()
    ads[0].onClose!(false)
    await refused
    p.time.t = 5 * MIN + 1000
    void p.showFullscreenAd()
    expect(ads).toHaveLength(2)
  })

  it('время — серверное', () => {
    expect(platform(fakeSdk().sdk).now()).toBe(123)
  })
})
