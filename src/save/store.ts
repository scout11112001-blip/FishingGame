/**
 * Где лежит сохранение. Асинхронно — как облачное сохранение Яндекса; остальной игре всё равно, куда пишется.
 */
export interface SaveStore {
  load(): Promise<string | null>
  /** urgent — игру сворачивают или закрывают: писать сразу, не откладывая. */
  save(json: string, urgent?: boolean): Promise<void>
  clear(): Promise<void>
  /** Отложить нечитаемое сохранение в сторону — чтобы было в чём разобраться, а игра началась заново. */
  backup(json: string): Promise<void>
}

/**
 * Сохранение в браузере игрока. Хранилище даёт getStorage: обычный localStorage или «безопасное» из SDK Яндекса.
 * Оно бывает недоступно — приватный режим, запрет сайта, переполнение: тогда тихо работаем без сохранения.
 */
export class LocalStore implements SaveStore {
  private readonly key: string
  private readonly getStorage: () => Storage

  constructor(key: string, getStorage: () => Storage) {
    this.key = key
    this.getStorage = getStorage
  }

  async load(): Promise<string | null> {
    try {
      return this.getStorage().getItem(this.key)
    } catch {
      return null
    }
  }

  async save(json: string): Promise<void> {
    try {
      this.getStorage().setItem(this.key, json)
    } catch {
      // Нет места или нет доступа — следующая запись попробует снова
    }
  }

  async clear(): Promise<void> {
    try {
      this.getStorage().removeItem(this.key)
    } catch {
      // Нечего стирать
    }
  }

  async backup(json: string): Promise<void> {
    try {
      this.getStorage().setItem(`${this.key}:broken`, json)
    } catch {
      // Не удалось — не страшно
    }
  }
}

/** Ключ сохранения в данных игрока Яндекса. */
const CLOUD_KEY = 'save'
/** Облако — не чаще раза в столько мс: у Яндекса не больше 100 записей за 5 минут. */
export const CLOUD_INTERVAL_MS = 10_000

/** То, что нужно облаку от игрока Яндекса (Player из SDK): прочитать и записать данные. */
export interface CloudPlayer {
  getData(keys: string[]): Promise<Record<string, unknown>>
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>
}

/**
 * Облачное сохранение Яндекса: player.setData / getData. Пишем не чаще CLOUD_INTERVAL_MS — свежий снимок
 * просто ждёт своей очереди; при сворачивании (urgent) — сразу и с flush, чтобы не потерять.
 */
export class CloudStore implements SaveStore {
  private readonly player: CloudPlayer
  private pending: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastWrite = -Infinity

  constructor(player: CloudPlayer) {
    this.player = player
  }

  async load(): Promise<string | null> {
    try {
      const data = await this.player.getData([CLOUD_KEY])
      const value = data[CLOUD_KEY]
      return typeof value === 'string' ? value : null
    } catch {
      return null
    }
  }

  async save(json: string, urgent = false): Promise<void> {
    this.pending = json
    if (urgent) return this.write(true)
    if (this.timer) return
    const wait = Math.max(0, this.lastWrite + CLOUD_INTERVAL_MS - Date.now())
    this.timer = setTimeout(() => void this.write(false), wait)
  }

  async clear(): Promise<void> {
    this.pending = null
    try {
      await this.player.setData({}, true)
    } catch {
      // Нет связи — сотрётся при следующей записи
    }
  }

  /** Битое в облако не откладываем: его копия уже лежит в браузере. */
  async backup(): Promise<void> {}

  private async write(flush: boolean) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.pending === null) return
    const json = this.pending
    this.pending = null
    this.lastWrite = Date.now()
    try {
      await this.player.setData({ [CLOUD_KEY]: json }, flush)
    } catch {
      // Не ушло — вернём в очередь, если новее ничего не пришло
      this.pending ??= json
    }
  }
}

/**
 * Сохранение сразу в двух местах: в браузере — мгновенно, в облаке — по очереди CloudStore.
 * При загрузке берётся более свежая копия (по времени записи): так прогресс переходит между устройствами,
 * а без связи игра работает со своей копией.
 */
export class MirrorStore implements SaveStore {
  private readonly local: SaveStore
  private readonly cloud: SaveStore

  constructor(local: SaveStore, cloud: SaveStore) {
    this.local = local
    this.cloud = cloud
  }

  async load(): Promise<string | null> {
    const [a, b] = await Promise.all([this.local.load(), this.cloud.load()])
    return newer(a, b)
  }

  async save(json: string, urgent = false): Promise<void> {
    await this.local.save(json)
    await this.cloud.save(json, urgent)
  }

  async clear(): Promise<void> {
    await Promise.all([this.local.clear(), this.cloud.clear()])
  }

  async backup(json: string): Promise<void> {
    await this.local.backup(json)
  }
}

/** Из двух сохранений — записанное позже. Нечитаемое проигрывает читаемому. */
export function newer(a: string | null, b: string | null): string | null {
  const time = (json: string | null) => {
    if (!json) return -1
    try {
      const t = JSON.parse(json)?.savedAt
      return typeof t === 'number' ? t : 0
    } catch {
      return 0
    }
  }
  return time(b) > time(a) ? b : a
}

/** Сохранение в памяти — для тестов. */
export class MemoryStore implements SaveStore {
  data: string | null = null
  broken: string | null = null
  writes = 0
  urgentWrites = 0

  async load(): Promise<string | null> {
    return this.data
  }

  async save(json: string, urgent = false): Promise<void> {
    this.data = json
    this.writes++
    if (urgent) this.urgentWrites++
  }

  async clear(): Promise<void> {
    this.data = null
  }

  async backup(json: string): Promise<void> {
    this.broken = json
  }
}
