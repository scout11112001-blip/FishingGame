import { parseSave, type PlayerState } from '../content/player.ts'
import type { SaveStore } from './store.ts'

/** Как часто проверяем, не изменился ли прогресс. У облака Яндекса есть ограничение на частоту записи. */
export const SAVE_INTERVAL_MS = 1000

/**
 * Автосохранение: раз в SAVE_INTERVAL_MS сравниваем снимок прогресса с записанным и пишем, только если он изменился.
 * Так не нужно звать сохранение из каждого места, где меняется прогресс, — ничего не забудется.
 * flush — записать немедленно: когда игру сворачивают или закрывают.
 */
export class AutoSaver {
  private readonly store: SaveStore
  private readonly player: PlayerState
  private last: string
  /** Последнее записанное целиком — со временем записи: при сворачивании его дописываем в облако без очереди. */
  private lastFull: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private disabled = false
  /** Часы для времени записи: на Яндексе серверные — по ним сравниваются копии с разных устройств. */
  private readonly clock: () => number

  constructor(store: SaveStore, player: PlayerState, clock: () => number = Date.now) {
    this.store = store
    this.player = player
    this.clock = clock
    // Только что загруженное записывать незачем
    this.last = this.snapshot()
  }

  start(): void {
    this.timer ??= setInterval(() => this.flush(), SAVE_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Больше не писать совсем — даже по flush: после сброса прогресса перезагрузка не должна записать его обратно. */
  disable(): void {
    this.stop()
    this.disabled = true
  }

  /**
   * Записать, если с прошлой записи что-то изменилось. urgent — игру сворачивают или закрывают:
   * пишем сразу, а если нового нет, всё равно досылаем последнее — облако могло ещё ждать своей очереди.
   */
  flush(urgent = false): void {
    if (this.disabled) return
    const json = this.snapshot()
    if (json !== this.last) {
      this.last = json
      this.lastFull = JSON.stringify({ ...this.player.toSave(), savedAt: this.clock() })
    } else if (!urgent || !this.lastFull) return
    void this.store.save(this.lastFull, urgent)
  }

  private snapshot(): string {
    return JSON.stringify(this.player.toSave())
  }
}

/** Загрузить прогресс из хранилища в player. Битое сохранение откладывается в сторону — игра начинается заново. */
export async function loadInto(player: PlayerState, store: SaveStore, now: number): Promise<'loaded' | 'empty' | 'broken'> {
  const json = await store.load()
  if (!json) return 'empty'
  const data = parseSave(json)
  if (!data) {
    await store.backup(json)
    return 'broken'
  }
  player.restore(data, now)
  return 'loaded'
}
