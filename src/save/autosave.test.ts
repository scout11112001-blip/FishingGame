import { describe, expect, it } from 'vitest'
import { PlayerState } from '../content/player.ts'
import { RIVERS } from '../content/rivers/index.ts'
import { AutoSaver, loadInto } from './autosave.ts'
import { MemoryStore } from './store.ts'

describe('автосохранение', () => {
  it('пишет, только когда прогресс изменился', () => {
    const store = new MemoryStore()
    const player = new PlayerState(RIVERS)
    const saver = new AutoSaver(store, player)
    saver.flush()
    expect(store.writes).toBe(0)

    player.shop.earn(10)
    saver.flush()
    saver.flush()
    expect(store.writes).toBe(1)
    expect(JSON.parse(store.data!).silver).toBe(10)
    expect(JSON.parse(store.data!).savedAt).toBeGreaterThan(0)
  })

  it('после отключения не пишет вовсе — сброс прогресса не перезапишется', () => {
    const store = new MemoryStore()
    const player = new PlayerState(RIVERS)
    const saver = new AutoSaver(store, player)
    saver.disable()
    player.shop.earn(10)
    saver.flush()
    expect(store.writes).toBe(0)
  })

  it('загрузка: пусто — новый игрок, битое — в сторону и заново, целое — восстанавливается', async () => {
    const store = new MemoryStore()
    expect(await loadInto(new PlayerState(RIVERS), store, 0)).toBe('empty')

    store.data = '{ сломано'
    const fresh = new PlayerState(RIVERS)
    expect(await loadInto(fresh, store, 0)).toBe('broken')
    expect(store.broken).toBe('{ сломано')
    expect(fresh.shop.silver).toBe(0)

    const player = new PlayerState(RIVERS)
    player.shop.earn(123)
    store.data = JSON.stringify({ ...player.toSave(), savedAt: 1 })
    const loaded = new PlayerState(RIVERS)
    expect(await loadInto(loaded, store, 0)).toBe('loaded')
    expect(loaded.shop.silver).toBe(123)
  })
})
