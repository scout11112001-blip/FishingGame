import type { VkBridge } from './vk.ts'

/**
 * Имитация VK Bridge для npm run dev:vk: ВК-версию игры (без звука, со ссылкой на поддержку, с облаком ВК) можно
 * гонять в обычном браузере. Хранилище ВК — в localStorage, реклама «показывается» секунду и засчитывается.
 * Только для сервера разработки: в сборку не попадает.
 */
export function mockVkBridge(): VkBridge {
  const prefix = 'vk-mock:'
  return {
    async send(method, props = {}) {
      switch (method) {
        case 'VKWebAppStorageGet':
          return { keys: (props.keys as string[]).map((key) => ({ key, value: localStorage.getItem(prefix + key) ?? '' })) }
        case 'VKWebAppStorageSet': {
          const { key, value } = props as { key: string; value: string }
          if (value) localStorage.setItem(prefix + key, value)
          else localStorage.removeItem(prefix + key)
          return { result: true }
        }
        case 'VKWebAppShowNativeAds':
          console.info(`[vk-mock] реклама ${props.ad_format === 'reward' ? 'за награду' : 'межстраничная'} — секунда «показа»`)
          await new Promise((r) => setTimeout(r, 1000))
          return { result: true }
        default:
          return { result: true }
      }
    },
    subscribe() {},
  }
}
