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
  private timer: ReturnType<typeof setInterval> | null = null
  private disabled = false

  constructor(store: SaveStore, player: PlayerState) {
    this.store = store
    this.player = player
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

  /** Записать, если с прошлой записи что-то изменилось. */
  flush(): void {
    if (this.disabled) return
    const json = this.snapshot()
    if (json === this.last) return
    this.last = json
    void this.store.save(JSON.stringify({ ...this.player.toSave(), savedAt: Date.now() }))
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
