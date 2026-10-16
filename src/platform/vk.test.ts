import { describe, expect, it } from 'vitest'
import { CloudStore, CLOUD_KEY } from '../save/store.ts'
import { FULLSCREEN_AD_INTERVAL_MS, VK_VALUE_MAX, VkCloud, vkKey, VkPlatform, type VkBridge } from './vk.ts'

type Call = { method: string; props?: Record<string, unknown> }

/** VK Bridge в памяти: записывает вызовы, отвечает по правилам теста, события присылает по команде. */
function fakeBridge(answer: (call: Call) => Promise<unknown> = async () => ({ result: true })) {
  const calls: Call[] = []
  const listeners: ((e: { detail?: { type?: string } }) => void)[] = []
  const storage: Record<string, string> = {}
  const bridge: VkBridge = {
    send: (method, props) => {
      calls.push({ method, props })
      if (method === 'VKWebAppStorageSet') {
        const { key, value } = props as { key: string; value: string }
        if (value) storage[key] = value
        else delete storage[key]
        return Promise.resolve({ result: true })
      }
      if (method === 'VKWebAppStorageGet') {
        const keys = (props as { keys: string[] }).keys
        return Promise.resolve({ keys: keys.map((key) => ({ key, value: storage[key] ?? '' })) })
      }
      return answer({ method, props })
    },
    subscribe: (l) => listeners.push(l),
  }
  const emit = (type: string) => listeners.forEach((l) => l({ detail: { type } }))
  return { bridge, calls, storage, emit }
}

/** time — часы устройства, adTime — монотонные часы интервала рекламы. */
function platform(bridge: VkBridge, launchTime: number | null = null, now = 1_000_000) {
  const time = { t: now }
  const adTime = { t: 0 }
  const options = { launchTime, supportUrl: 'https://vk.com/nasha.rybalka', clock: () => time.t, timer: () => adTime.t }
  return Object.assign(new VkPlatform(bridge, options), { time, adTime })
}

const shows = (calls: Call[]) => calls.filter((c) => c.method === 'VKWebAppShowNativeAds').map((c) => c.props?.ad_format)

describe('ВКонтакте: площадка', () => {
  it('без звука, со ссылкой на поддержку, с рекламой за награду', () => {
    const p = platform(fakeBridge().bridge)
    expect(p.name).toBe('vk')
    expect(p.sounds).toBe(false)
    expect(p.supportUrl).toBe('https://vk.com/nasha.rybalka')
    expect(p.rewardedAds).toBe(true)
  })

  it('время — от времени запуска ВК, а не от часов устройства', () => {
    // Часы устройства убежали на сутки вперёд; ВК при запуске прислал настоящее время
    const day = 24 * 60 * 60 * 1000
    const real = 1_800_000_000_000
    const p = platform(fakeBridge().bridge, real / 1000, real + day)
    expect(p.now()).toBe(real)
    p.time.t += 5000
    expect(p.now()).toBe(real + 5000)
  })

  it('без времени ВК — часы устройства', () => {
    const p = platform(fakeBridge().bridge, null, 42_000)
    expect(p.now()).toBe(42_000)
  })

  it('реклама за награду: ВК показал — награда; ошибка или «нет рекламы» — нет', async () => {
    let next: () => Promise<unknown> = async () => ({ result: true })
    const { bridge } = fakeBridge(() => next())
    const p = platform(bridge)
    expect(await p.showRewardedAd()).toBe(true)
    next = async () => ({ result: false })
    expect(await p.showRewardedAd()).toBe(false)
    next = () => Promise.reject({ error_type: 'client_error', error_data: { error_code: 20, error_reason: 'No ads' } })
    expect(await p.showRewardedAd()).toBe(false)
  })

  it('реклама за награду — формат reward; заранее и после каждого показа ВК просят подгрузить следующую', async () => {
    const { bridge, calls } = fakeBridge()
    const p = platform(bridge)
    expect(calls).toEqual([
      { method: 'VKWebAppCheckNativeAds', props: { ad_format: 'reward' } },
      { method: 'VKWebAppCheckNativeAds', props: { ad_format: 'interstitial' } },
    ])
    await p.showRewardedAd()
    expect(calls.slice(2)).toEqual([
      { method: 'VKWebAppShowNativeAds', props: { ad_format: 'reward' } },
      { method: 'VKWebAppCheckNativeAds', props: { ad_format: 'reward' } },
    ])
  })

  it('пока идёт реклама, игра на паузе; вторая не запрашивается поверх первой', async () => {
    let finish!: (v: unknown) => void
    const { bridge, calls } = fakeBridge(() => new Promise((r) => (finish = r)))
    const p = platform(bridge)
    const pauses: boolean[] = []
    p.onPause((paused) => pauses.push(paused))
    const first = p.showRewardedAd()
    expect(pauses).toEqual([true])
    expect(await p.showRewardedAd()).toBe(false)
    expect(calls.filter((c) => c.method === 'VKWebAppShowNativeAds')).toHaveLength(1)
    finish({ result: true })
    expect(await first).toBe(true)
    expect(pauses).toEqual([true, false])
  })

  it('свернули в приложении ВК (ViewHide) — пауза, вернулись (ViewRestore) — снята; реклама не снимает чужую паузу', async () => {
    let finish!: (v: unknown) => void
    const { bridge, emit } = fakeBridge(() => new Promise((r) => (finish = r)))
    const p = platform(bridge)
    const pauses: boolean[] = []
    p.onPause((paused) => pauses.push(paused))
    emit('VKWebAppViewHide')
    emit('VKWebAppViewHide')
    expect(pauses).toEqual([true])
    emit('VKWebAppViewRestore')
    expect(pauses).toEqual([true, false])
    // Реклама, а посреди неё свернули и развернули: пауза держится до конца рекламы
    const ad = p.showRewardedAd()
    emit('VKWebAppViewHide')
    emit('VKWebAppViewRestore')
    expect(pauses).toEqual([true, false, true])
    finish({ result: true })
    await ad
    expect(pauses).toEqual([true, false, true, false])
  })

  it('межстраничная — не раньше 4 минут от запуска и не чаще раза в 4 минуты; после показа подгружается следующая', async () => {
    expect(FULLSCREEN_AD_INTERVAL_MS).toBe(4 * 60 * 1000)
    const { bridge, calls } = fakeBridge()
    const p = platform(bridge)
    await p.showFullscreenAd()
    p.adTime.t = FULLSCREEN_AD_INTERVAL_MS - 1
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual([])
    p.adTime.t = FULLSCREEN_AD_INTERVAL_MS
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['interstitial'])
    expect(calls.at(-1)).toEqual({ method: 'VKWebAppCheckNativeAds', props: { ad_format: 'interstitial' } })
    p.adTime.t += FULLSCREEN_AD_INTERVAL_MS - 1
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['interstitial'])
    p.adTime.t += 1
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['interstitial', 'interstitial'])
  })

  it('таймер общий: показанная реклама за награду сдвигает межстраничную', async () => {
    const { bridge, calls } = fakeBridge()
    const p = platform(bridge)
    p.adTime.t = FULLSCREEN_AD_INTERVAL_MS * 3
    expect(await p.showRewardedAd()).toBe(true)
    p.adTime.t += FULLSCREEN_AD_INTERVAL_MS - 1
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['reward'])
    p.adTime.t += 1
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['reward', 'interstitial'])
  })

  it('не показанная реклама («нет рекламы», отказ) таймер не сбрасывает: попробуем в следующий раз', async () => {
    let next: () => Promise<unknown> = () => Promise.reject({ error_data: { error_code: 20 } })
    const { bridge, calls } = fakeBridge(() => next())
    const p = platform(bridge)
    p.adTime.t = FULLSCREEN_AD_INTERVAL_MS
    await p.showFullscreenAd()
    expect(await p.showRewardedAd()).toBe(false)
    next = async () => ({ result: true })
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['interstitial', 'reward', 'interstitial'])
  })

  it('межстраничная не лезет поверх рекламы за награду; пока идёт, игра на паузе', async () => {
    let finish!: (v: unknown) => void
    const { bridge, calls } = fakeBridge(() => new Promise((r) => (finish = r)))
    const p = platform(bridge)
    const pauses: boolean[] = []
    p.onPause((paused) => pauses.push(paused))
    p.adTime.t = FULLSCREEN_AD_INTERVAL_MS
    const rewarded = p.showRewardedAd()
    await p.showFullscreenAd()
    expect(shows(calls)).toEqual(['reward'])
    finish({ result: true })
    await rewarded
    p.adTime.t += FULLSCREEN_AD_INTERVAL_MS
    const interstitial = p.showFullscreenAd()
    expect(pauses).toEqual([true, false, true])
    expect(await p.showRewardedAd()).toBe(false)
    finish({ result: true })
    await interstitial
    expect(pauses).toEqual([true, false, true, false])
    expect(shows(calls)).toEqual(['reward', 'interstitial'])
  })
})

describe('ВКонтакте: облачное сохранение', () => {
  it('ключ хранилища — только разрешённые символы, не длиннее 100', () => {
    expect(vkKey('fishing:rivers:sandbox')).toBe('fishing_rivers_sandbox')
    expect(vkKey('x'.repeat(150))).toHaveLength(100)
  })

  it('записанное читается обратно — через очередь CloudStore', async () => {
    const { bridge, storage } = fakeBridge()
    const cloud = new CloudStore(new VkCloud(bridge, 'fishing:rivers'))
    await cloud.save('{"savedAt":1}', true)
    expect(storage).toEqual({ fishing_rivers_save: '{"savedAt":1}' })
    expect(await cloud.load()).toBe('{"savedAt":1}')
  })

  it('пусто — null; стирание удаляет ключ ВК', async () => {
    const { bridge, storage } = fakeBridge()
    const cloud = new CloudStore(new VkCloud(bridge, 'k'))
    expect(await cloud.load()).toBeNull()
    await cloud.save('{"a":1}', true)
    await cloud.clear()
    expect(storage).toEqual({})
    expect(await cloud.load()).toBeNull()
  })

  it('слишком длинное не пишется вовсе: обрезанный JSON хуже, чем никакого', async () => {
    const { bridge, calls } = fakeBridge()
    const vk = new VkCloud(bridge, 'k')
    await expect(vk.setData({ [CLOUD_KEY]: 'x'.repeat(VK_VALUE_MAX + 1) })).rejects.toThrow()
    expect(calls.some((c) => c.method === 'VKWebAppStorageSet')).toBe(false)
    await vk.setData({ [CLOUD_KEY]: 'x'.repeat(VK_VALUE_MAX) })
    expect(calls.filter((c) => c.method === 'VKWebAppStorageSet')).toHaveLength(1)
  })

  it('ВК не ответил при загрузке — играем без облака (null), а не висим', async () => {
    const bridge: VkBridge = { send: () => new Promise(() => {}), subscribe: () => {} }
    const cloud = new CloudStore(new VkCloud(bridge, 'k'))
    const started = Date.now()
    expect(await cloud.load()).toBeNull()
    expect(Date.now() - started).toBeLessThan(6000)
  }, 10_000)
})

describe('Одноклассники (та же игра, vk_client=ok)', () => {
  /** localStorage в памяти: у ВК и ОК адрес игры один — и браузерное хранилище общее. */
  function memoryStorage(): Storage {
    const items = new Map<string, string>()
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    } as unknown as Storage
  }

  it('ссылки на сообщество ВК нет: Одноклассники запрещают уводить из Одноклассников', () => {
    const { bridge } = fakeBridge()
    const support = 'https://vk.com/nasha.rybalka'
    expect(new VkPlatform(bridge, { launchTime: null, supportUrl: support, ok: true }).supportUrl).toBeNull()
    expect(new VkPlatform(bridge, { launchTime: null, supportUrl: support }).supportUrl).toBe(support)
  })

  it('прогресс свой: копии ВК не видно ни в облаке, ни в браузере, и наоборот; ключ ВК прежний', async () => {
    const { bridge, storage: cloud } = fakeBridge()
    const local = memoryStorage()
    const vk = new VkPlatform(bridge, { launchTime: null, supportUrl: null, storage: () => local })
    const ok = new VkPlatform(bridge, { launchTime: null, supportUrl: null, ok: true, storage: () => local })
    await vk.saveStore('fishing:rivers').save('{"savedAt":1,"from":"vk"}', true)
    expect(Object.keys(cloud)).toEqual(['fishing_rivers_save'])
    expect(await ok.saveStore('fishing:rivers').load()).toBeNull()
    await ok.saveStore('fishing:rivers').save('{"savedAt":2,"from":"ok"}', true)
    expect(Object.keys(cloud).sort()).toEqual(['fishing_rivers_ok_save', 'fishing_rivers_save'])
    expect(await vk.saveStore('fishing:rivers').load()).toBe('{"savedAt":1,"from":"vk"}')
    expect(await ok.saveStore('fishing:rivers').load()).toBe('{"savedAt":2,"from":"ok"}')
  })
})
