import { LocalPlatform } from './local.ts'
import type { Platform } from './platform.ts'
import { YandexPlatform } from './yandex.ts'

/** Сколько ждать SDK: дольше — значит, игра открыта не на Яндексе, играем без него. */
const SDK_TIMEOUT_MS = 5000

/**
 * На какой площадке запущена игра. Сервер разработки (npm run dev) — всегда без SDK.
 * В сборке — подключаем SDK по документации: скрипт /sdk.js (относительный путь — для игр, загруженных
 * в консоль Яндекса), затем YaGames.init(). Скрипта нет или он не ответил — игра идёт без Яндекса, но идёт.
 */
export async function loadPlatform(): Promise<Platform> {
  if (import.meta.hot) return new LocalPlatform()
  try {
    await loadScript('/sdk.js')
    const ysdk = await timeout(YaGames.init())
    // Данные игрока — для облачных сохранений. Не дал — сохраняемся только в браузере
    const player = await ysdk.getPlayer().catch(() => null)
    // «Безопасное хранилище» вместо localStorage: в iframe на iOS обычное сбрасывается
    const storage = await ysdk.getStorage().catch(() => window.localStorage)
    return new YandexPlatform(ysdk, player, storage)
  } catch {
    return new LocalPlatform()
  }
}

function loadScript(src: string): Promise<void> {
  return timeout(
    new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error(`нет ${src}`))
      document.head.append(script)
    }),
  )
}

function timeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('SDK не ответил')), SDK_TIMEOUT_MS))])
}
