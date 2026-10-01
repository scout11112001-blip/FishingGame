import { describe, expect, it } from 'vitest'
import { ALL_PACKS } from './index.ts'
import { isWaterOpen, newlyOpened, nextLockedWater } from './progress.ts'
import { RIVERS } from './rivers/index.ts'

const [POND, RIVER, LAKE] = RIVERS.waters

describe('опыт и открытие водоёмов', () => {
  it.each(ALL_PACKS.map((p) => [p.id, p] as const))('пакет %s: первый водоём открыт сразу, дальше пороги растут', (_id, pack) => {
    expect(isWaterOpen(pack.waters[0], 0)).toBe(true)
    const thresholds = pack.waters.map((w) => w.unlockXp ?? 0)
    expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds)
  })

  it('река — на 40 опыта (около 10 минут), озеро — на 400 (около 2 часов)', () => {
    expect(RIVERS.waters.map((w) => w.unlockXp ?? 0)).toEqual([0, 40, 400])
    expect(isWaterOpen(RIVER, 39)).toBe(false)
    expect(isWaterOpen(RIVER, 40)).toBe(true)
    expect(isWaterOpen(LAKE, 399)).toBe(false)
  })

  it('полоска опыта ведёт к ближайшему закрытому водоёму, а после последнего — никуда', () => {
    expect(nextLockedWater(RIVERS, 0)).toBe(RIVER)
    expect(nextLockedWater(RIVERS, 40)).toBe(LAKE)
    expect(nextLockedWater(RIVERS, 400)).toBeUndefined()
  })

  it('водоём открывается ровно той рыбой, что добрала порог', () => {
    expect(newlyOpened(RIVERS, 38, 39)).toEqual([])
    expect(newlyOpened(RIVERS, 39, 40)).toEqual([RIVER])
    expect(newlyOpened(RIVERS, 40, 41)).toEqual([])
    expect(newlyOpened(RIVERS, 0, 400)).toEqual([RIVER, LAKE])
    expect(newlyOpened(RIVERS, 0, 0)).not.toContain(POND)
  })
})
