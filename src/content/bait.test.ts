import { describe, expect, it } from 'vitest'
import { BAIT_DURATION_MS, baitedZones, baitWaters, baitWorks, chanceOf, isBaitActive, zonesFor } from './bait.ts'
import { RIVERS } from './rivers/index.ts'
import { BREAM, CATFISH, ZANDER } from './rivers/fish.ts'
import { zoneSpawns } from './types.ts'

const [POND, RIVER, LAKE] = RIVERS.waters
const total = (spawns: readonly { rarity: number }[]) => spawns.reduce((sum, s) => sum + s.rarity, 0)

describe('прикормка', () => {
  it('там, где рыба водится, её шанс вдвое выше', () => {
    for (const water of RIVERS.waters) {
      for (const bait of RIVERS.baits) {
        const baited = baitedZones(water, bait.species)
        water.zones.forEach((zone, i) => {
          const before = chanceOf(zone.spawns, bait.species)
          if (before > 0) expect(chanceOf(baited[i], bait.species)).toBeCloseTo(Math.min(1, before * 2))
        })
      }
    }
  })

  it('на месте, где рыба не водится, она клюёт с шансом своего ближнего места без прикормки', () => {
    // Лещ на реке: у берега его нет, на бровке — 35%
    expect(chanceOf(baitedZones(RIVER, BREAM)[0], BREAM)).toBeCloseTo(0.35)
    // Сом на озере есть только в глубокой яме — 20%, туда его и подманиваем
    const lake = baitedZones(LAKE, CATFISH)
    expect(chanceOf(lake[0], CATFISH)).toBeCloseTo(0.2)
    expect(chanceOf(lake[1], CATFISH)).toBeCloseTo(0.2)
    expect(chanceOf(lake[2], CATFISH)).toBeCloseTo(0.4)
  })

  it('остальная рыба места делит оставшийся шанс в прежних пропорциях', () => {
    const [shore, edge] = baitedZones(RIVER, BREAM)
    // Бровка: плотва и окунь по 20 из 65 не-лещей → по 20/65 от оставшихся 30%
    const roach = edge.find((s) => s.species.id === 'roach')!
    expect(roach.rarity / total(edge)).toBeCloseTo((0.2 / 0.65) * 0.3)
    // У берега плотва и окунь поровну делят 65%
    for (const s of shore.filter((s) => s.species !== BREAM)) expect(s.rarity / total(shore)).toBeCloseTo(0.325)
    for (const zone of baitedZones(LAKE, ZANDER)) expect(total(zone)).toBeCloseTo(100)
  })

  it('пришлая рыба растёт как местные: размер места, а не родного', () => {
    const [shore] = baitedZones(RIVER, BREAM)
    expect(shore.find((s) => s.species === BREAM)!.sizeSkew).toBe(RIVER.zones[0].spawns[0].sizeSkew)
  })

  it('работает только на водоёмах, где рыба водится сама', () => {
    expect(baitWorks(POND, ZANDER)).toBe(false)
    expect(baitWorks(POND, CATFISH)).toBe(false)
    expect(baitedZones(POND, CATFISH)).toEqual(zoneSpawns(POND))
    expect(baitWaters(RIVERS, RIVERS.baits.find((b) => b.species === BREAM)!)).toEqual([POND, RIVER, LAKE])
    expect(baitWaters(RIVERS, RIVERS.baits.find((b) => b.species === CATFISH)!)).toEqual([RIVER, LAKE])
  })

  it('действует 2 часа, потом места ловли как были', () => {
    const active = { bait: RIVERS.baits[0], until: 1000 + BAIT_DURATION_MS }
    expect(isBaitActive(active, 1000 + BAIT_DURATION_MS - 1)).toBe(true)
    expect(isBaitActive(active, 1000 + BAIT_DURATION_MS)).toBe(false)
    expect(zonesFor(RIVER, active, 1000)).not.toEqual(zoneSpawns(RIVER))
    expect(zonesFor(RIVER, active, 1000 + BAIT_DURATION_MS)).toEqual(zoneSpawns(RIVER))
    expect(zonesFor(RIVER, null, 0)).toEqual(zoneSpawns(RIVER))
  })

  it('каждая прикормка пакета на рыбу из пакета, которая где-то водится, и описание говорит про 2 часа', () => {
    expect(BAIT_DURATION_MS).toBe(2 * 60 * 60 * 1000)
    for (const bait of RIVERS.baits) {
      expect(RIVERS.fish).toContain(bait.species)
      expect(baitWaters(RIVERS, bait).length, bait.name).toBeGreaterThan(0)
      expect(bait.description, bait.name).toContain('2 часа')
    }
    expect(RIVERS.baits.map((b) => b.species)).toEqual([BREAM, ZANDER, CATFISH])
  })
})
