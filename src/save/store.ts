/**
 * Где лежит сохранение. Асинхронно — как облачное сохранение Яндекса, которое добавится вторым вариантом;
 * остальной игре всё равно, какой из них работает.
 */
export interface SaveStore {
  load(): Promise<string | null>
  save(json: string): Promise<void>
  clear(): Promise<void>
  /** Отложить нечитаемое сохранение в сторону — чтобы было в чём разобраться, а игра началась заново. */
  backup(json: string): Promise<void>
}

/**
 * Сохранение в браузере игрока (localStorage). Хранилище бывает недоступно — приватный режим, запрет сайта,
 * переполнение: тогда тихо работаем без сохранения, игра от этого не ломается.
 */
export class LocalStore implements SaveStore {
  private readonly key: string

  constructor(key: string) {
    this.key = key
  }

  async load(): Promise<string | null> {
    try {
      return localStorage.getItem(this.key)
    } catch {
      return null
    }
  }

  async save(json: string): Promise<void> {
    try {
      localStorage.setItem(this.key, json)
    } catch {
      // Нет места или нет доступа — следующая запись попробует снова
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.key)
    } catch {
      // Нечего стирать
    }
  }

  async backup(json: string): Promise<void> {
    try {
      localStorage.setItem(`${this.key}:broken`, json)
    } catch {
      // Не удалось — не страшно
    }
  }
}

/** Сохранение в памяти — для тестов. */
export class MemoryStore implements SaveStore {
  data: string | null = null
  broken: string | null = null
  writes = 0

  async load(): Promise<string | null> {
    return this.data
  }

  async save(json: string): Promise<void> {
    this.data = json
    this.writes++
  }

  async clear(): Promise<void> {
    this.data = null
  }

  async backup(json: string): Promise<void> {
    this.broken = json
  }
}
