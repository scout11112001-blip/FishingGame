import { describe, expect, it } from 'vitest'
import { simulateLargest, simulateSpecies } from '../sim/simulate.ts'
import { ALL_PACKS } from './index.ts'
import { tackleOf, type ContentPack, type Loadout } from './types.ts'

/** Лучшая снасть пакета: самая прочная леска, самая быстрая катушка, удочка с самым коротким забросом. */
function bestLoadout(pack: ContentPack): Loadout {
  const maxBy = <T>(items: readonly T[], key: (t: T) => number) => items.reduce((a, b) => (key(b) > key(a) ? b : a))
  return {
    rod: maxBy(pack.rods, (r) => -r.castMax),
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
    for (const water of pack.waters) for (const s of water.spawns) expect(pack.fish).toContain(s.species)
  })

  // Худший случай: самая крупная особь каждого вида против лучшей снасти пакета.
  // Бот с реакцией 0.5 с должен вытаскивать её хотя бы в четверти попыток — иначе рыба для игрока непоймаема.
  const best = tackleOf(bestLoadout(pack))
  for (const water of pack.waters) {
    for (const { species } of water.spawns) {
      it(`${water.name}: самый крупный ${species.name} ловится лучшей снастью`, () => {
        expect(simulateLargest(species, { tackle: best }, 30).catchRate).toBeGreaterThanOrEqual(0.25)
      })
    }
  }

  it('в первом водоёме самая частая рыба почти всегда ловится стартовой снастью', () => {
    const first = pack.waters[0]
    const common = first.spawns.reduce((a, b) => (b.rarity > a.rarity ? b : a))
    expect(simulateSpecies(common, { tackle: tackleOf(pack.starter) }, 50).catchRate).toBeGreaterThanOrEqual(0.9)
  })
})
