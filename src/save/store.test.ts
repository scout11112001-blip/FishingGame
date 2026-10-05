import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerState } from '../content/player.ts'
import { RIVERS } from '../content/rivers/index.ts'
import { AutoSaver } from './autosave.ts'
import { CLOUD_INTERVAL_MS, CloudStore, MemoryStore, MirrorStore, newer } from './store.ts'

/** Данные игрока Яндекса в памяти: считаем записи и запоминаем, срочные ли они. */
function fakePlayer() {
  const calls: { data: Record<string, unknown>; flush: boolean }[] = []
  let stored: Record<string, unknown> = {}
  return {
    calls,
    async getData() {
      return stored
    },
    async setData(data: Record<string, unknown>, flush = false) {
      calls.push({ data, flush })
      stored = data
    },
  }
}

const save = (savedAt: number, silver = 0) => JSON.stringify({ v: 1, savedAt, silver })

describe('облачное сохранение', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('пишет в облако не чаще раза в CLOUD_INTERVAL_MS — и всегда самое свежее', async () => {
    const player = fakePlayer()
    const cloud = new CloudStore(player)
    await cloud.save(save(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(player.calls).toHaveLength(1)

    await cloud.save(save(2))
    await cloud.save(save(3))
    await vi.advanceTimersByTimeAsync(CLOUD_INTERVAL_MS - 100)
    expect(player.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(player.calls).toHaveLength(2)
    expect(player.calls[1].data.save).toBe(save(3))
    expect(player.calls[1].flush).toBe(false)
  })

  it('при сворачивании — сразу и с flush, не дожидаясь очереди', async () => {
    const player = fakePlayer()
    const cloud = new CloudStore(player)
    await cloud.save(save(1))
    await vi.advanceTimersByTimeAsync(0)
    await cloud.save(save(2), true)
    expect(player.calls).toHaveLength(2)
    expect(player.calls[1]).toEqual({ data: { save: save(2) }, flush: true })
    // Очередь не дописывает то же самое ещё раз
    await vi.advanceTimersByTimeAsync(CLOUD_INTERVAL_MS * 2)
    expect(player.calls).toHaveLength(2)
  })

  it('читает своё сохранение; чужие данные — не сохранение', async () => {
    const player = fakePlayer()
    const cloud = new CloudStore(player)
    expect(await cloud.load()).toBeNull()
    await player.setData({ save: save(5) })
    expect(await cloud.load()).toBe(save(5))
    await player.setData({ save: 42 })
    expect(await cloud.load()).toBeNull()
  })
})

describe('сохранение в двух местах', () => {
  it('из двух копий берётся записанная позже; нечитаемая проигрывает', () => {
    expect(newer(save(10), save(20))).toBe(save(20))
    expect(newer(save(30), save(20))).toBe(save(30))
    expect(newer(null, save(1))).toBe(save(1))
    expect(newer(save(1), null)).toBe(save(1))
    expect(newer('мусор', save(1))).toBe(save(1))
  })

  it('загрузка — более свежая копия: прогресс переходит с другого устройства', async () => {
    const local = new MemoryStore()
    const cloud = new MemoryStore()
    local.data = save(100, 5)
    cloud.data = save(200, 50)
    expect(await new MirrorStore(local, cloud).load()).toBe(save(200, 50))
  })

  it('запись — в обе, срочность доходит до облака', async () => {
    const local = new MemoryStore()
    const cloud = new MemoryStore()
    await new MirrorStore(local, cloud).save(save(1), true)
    expect(local.data).toBe(save(1))
    expect(cloud.data).toBe(save(1))
    expect(cloud.urgentWrites).toBe(1)
  })

  it('при сворачивании автосохранение досылает последнее, даже если нового нет', () => {
    const store = new MemoryStore()
    const player = new PlayerState(RIVERS)
    const saver = new AutoSaver(store, player)
    // Ещё ничего не писали — досылать нечего
    saver.flush(true)
    expect(store.writes).toBe(0)

    player.shop.earn(5)
    saver.flush()
    saver.flush(true)
    expect(store.writes).toBe(2)
    expect(store.urgentWrites).toBe(1)
  })
})
