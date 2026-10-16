import { LocalPlatform } from './local.ts'
import type { Platform } from './platform.ts'
import type { VkBridge } from './vk.ts'
import { YandexPlatform } from './yandex.ts'

/** Сколько ждать SDK: дольше — значит, игра открыта не на площадке, играем без неё. */
const SDK_TIMEOUT_MS = 5000

/**
 * На какой площадке запущена игра. Сервер разработки (npm run dev) — без площадки, а в режиме vk — с имитацией ВК.
 * В сборке для ВК — VK Bridge (loadVk). В обычной — SDK Яндекса по документации: скрипт /sdk.js (относительный путь —
 * для игр, загруженных в консоль Яндекса), затем YaGames.init(). Скрипта нет или он не ответил — игра идёт без
 * площадки, но идёт.
 */
export async function loadPlatform(): Promise<Platform> {
  // Проверка прямо по переменной сборки: Vite подставляет её значение, и ветка другой площадки вырезается вместе с кодом
  if (import.meta.env.VITE_TARGET === 'vk') return loadVk()
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

/**
 * ВКонтакте и Одноклассники. VKWebAppInit — первым делом, до загрузки картинок: ВК ждёт его не дольше 30 секунд,
 * а до него показывает свой экран запуска. Сборку открыли не во ВК (просто по адресу хостинга) — играем без площадки;
 * на сервере разработки (npm run dev:vk) — с имитацией VK Bridge, чтобы видеть ВК-версию.
 */
async function loadVk(): Promise<Platform> {
  const { VkPlatform } = await import('./vk.ts')
  const { default: bridge } = await import('@vkontakte/vk-bridge')
  let api: VkBridge
  if (bridge.isEmbedded()) {
    await timeout(bridge.send('VKWebAppInit')).catch(() => {})
    // У VK Bridge строгие типы на каждое событие — площадке хватает простого «отправить» и «подписаться»
    api = {
      send: (method, props) => bridge.send(method as never, props as never),
      subscribe: (listener) => bridge.subscribe(listener as never),
    }
  } else if (import.meta.env.DEV) {
    api = (await import('./vkMock.ts')).mockVkBridge()
  } else return new LocalPlatform()
  const params = new URLSearchParams(window.location.search)
  const launchTime = Number(params.get('vk_ts'))
  return new VkPlatform(api, {
    launchTime: Number.isFinite(launchTime) && launchTime > 0 ? launchTime : null,
    supportUrl: import.meta.env.VITE_SUPPORT_URL || null,
    // Та же игра в Одноклассниках: там vk_client=ok (https://dev.vk.ru/ru/ok/development/launch-parameters)
    ok: params.get('vk_client') === 'ok',
  })
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
