/// <reference types="node" />
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FishSpecies } from '../core/fish.ts'
import { MAX_CAST_LEVELS } from '../core/FishingSession.ts'
import { simulateLargest, simulateSpecies } from '../sim/simulate.ts'
import { ALL_PACKS } from './index.ts'
import { RIVERS } from './rivers/index.ts'
import { rodFits, rodReach, tackleOf, weakestFittingRod, type CastZone, type ContentPack, type Loadout } from './types.ts'

const maxBy = <T>(items: readonly T[], key: (t: T) => number) => items.reduce((a, b) => (key(b) > key(a) ? b : a))

/** Лучшая снасть пакета: самая прочная леска, самая быстрая катушка, самая дальнобойная удочка (дальше — дольше бой). */
function bestLoadout(pack: ContentPack): Loadout {
  return {
    rod: maxBy(pack.rods, (r) => r.castLevels),
    line: maxBy(pack.lines, (l) => l.strength),
    reel: maxBy(pack.reels, (r) => r.speed),
  }
}

describe.each(ALL_PACKS.map((p) => [p.id, p] as const))('пакет %s', (_id, pack) => {
  it('идентификаторы уникальны (по ним будут сохранения)', () => {
    for (const list of [pack.fish, pack.waters, pack.rods, pack.lines, pack.reels]) {
      const ids = list.map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('все рыбы водоёмов есть в общем списке рыб пакета', () => {
    for (const water of pack.waters) for (const zone of water.zones) for (const s of zone.spawns) expect(pack.fish).toContain(s.species)
  })

  it('у водоёмов от 1 до MAX_CAST_LEVELS мест ловли, и лучшая удочка добрасывает до последнего везде', () => {
    for (const water of pack.waters) expect(water.zones.length >= 1 && water.zones.length <= MAX_CAST_LEVELS).toBe(true)
    for (const rod of pack.rods) expect(rod.castLevels >= 1 && rod.castLevels <= MAX_CAST_LEVELS).toBe(true)
    const best = maxBy(pack.rods, (r) => r.castLevels)
    for (const water of pack.waters) expect(rodReach(water, best), water.name).toBeGreaterThanOrEqual(water.zones.length)
  })

  it('на каждом водоёме есть подходящая удочка, а в первом ловится стартовой', () => {
    for (const water of pack.waters) expect(weakestFittingRod(pack, water), water.name).toBeDefined()
    expect(rodFits(pack.waters[0], pack.starter.rod)).toBe(true)
  })

  it('отметки фоновой картинки идут от берега к горизонту и покрывают все места ловли', () => {
    for (const { name, zones, backdrop } of pack.waters) {
      if (!backdrop) continue
      expect(backdrop.zoneEdges, name).toHaveLength(zones.length + 1)
      const marks = [backdrop.shore, ...backdrop.zoneEdges, backdrop.waterline]
      for (let i = 1; i < marks.length; i++) expect(marks[i], `${name}: отметка ${i}`).toBeLessThan(marks[i - 1])
      expect(backdrop.waterline).toBeGreaterThan(0)
      expect(backdrop.shore).toBeLessThan(1)
    }
  })

  it('все картинки пакета лежат в public/, и у каждой рыбы есть картинка', () => {
    const files = [
      ...pack.waters.flatMap((w) => (w.backdrop ? [w.backdrop.image] : [])),
      ...pack.rods.flatMap((r) => (r.sprite ? [r.sprite] : [])),
      ...(pack.art ? [pack.art.float, ...Object.values(pack.art.fish), ...(pack.art.silver ? [pack.art.silver] : [])] : []),
    ]
    for (const file of files) expect(existsSync(`public/${file}`), file).toBe(true)
    if (pack.art) for (const fish of pack.fish) expect(pack.art.fish[fish.id], fish.name).toBeDefined()
  })

  it('дальний заброс ничего не отнимает и добавляет новую рыбу', () => {
    for (const water of pack.waters) {
      for (let i = 1; i < water.zones.length; i++) {
        const near = speciesOf(water.zones[i - 1])
        const far = speciesOf(water.zones[i])
        for (const s of near) expect(far, `${water.name}: ${s.name} пропал на уровне ${i + 1}`).toContain(s)
        expect(far.length, `${water.name}: уровень ${i + 1} ничего не добавляет`).toBeGreaterThan(near.length)
      }
    }
  })

  // Худший случай: самая крупная особь каждого вида против лучшей снасти пакета.
  // Бот с реакцией 0.5 с должен вытаскивать её хотя бы в четверти попыток — иначе рыба для игрока непоймаема.
  const best = tackleOf(bestLoadout(pack))
  for (const water of pack.waters) {
    for (const species of speciesOf(water.zones.at(-1)!)) {
      it(`${water.name}: самый крупный ${species.name} ловится лучшей снастью`, () => {
        expect(simulateLargest(species, { tackle: best }, 30).catchRate).toBeGreaterThanOrEqual(0.25)
      })
    }
  }

  it('в первом водоёме у берега самая частая рыба почти всегда ловится стартовой снастью', () => {
    const common = maxBy(pack.waters[0].zones[0].spawns, (s) => s.rarity)
    expect(simulateSpecies(common, { tackle: tackleOf(pack.starter), cast: { level: 0, levels: pack.waters[0].zones.length } }, 50).catchRate).toBeGreaterThanOrEqual(0.9)
  })
})

describe('пакет rivers', () => {
  it('в пруду два места ловли: у берега 2 вида, в яме все 4', () => {
    expect(RIVERS.waters[0].zones.map((z) => z.spawns.length)).toEqual([2, 4])
  })

  it('вторая удочка добрасывает до конца пруда', () => {
    expect(RIVERS.rods[1].castLevels).toBeGreaterThanOrEqual(RIVERS.waters[0].zones.length)
  })

  it('на озере два места: бамбуковой нельзя, болонской — только первое, до ямы — фидером', () => {
    const lake = RIVERS.waters[2]
    expect(lake.zones.map((z) => z.spawns.length)).toEqual([4, 5])
    expect(RIVERS.rods.map((r) => rodReach(lake, r))).toEqual([0, 1, 2])
    expect(rodFits(lake, RIVERS.rods[0])).toBe(false)
    expect(weakestFittingRod(RIVERS, lake)).toBe(RIVERS.rods[1])
  })
})

function speciesOf(zone: CastZone): FishSpecies[] {
  return zone.spawns.map((s) => s.species)
}
