import type { FishSpawn, FishSpecies } from '../core/fish.ts'
import type { CastZones } from '../core/FishingSession.ts'
import { zoneSpawns, type Bait, type ContentPack, type WaterBody } from './types.ts'

/** Сколько действует прикормка. Длительность в описаниях прикормок пакета должна совпадать. */
export const BAIT_DURATION_MS = 2 * 60 * 60 * 1000
/** Во сколько раз прикормка повышает шанс поклёвки своей рыбы там, где та водится. */
export const BAIT_FACTOR = 2

/** Прикормка в деле: какая и до какого момента (Date.now()) действует. Время настоящее — идёт и при закрытой игре. */
export interface ActiveBait {
  bait: Bait
  until: number
}

export function isBaitActive(active: ActiveBait | null, now: number): active is ActiveBait {
  return !!active && now < active.until
}

/** Прикормка работает только на водоёмах, где её рыба водится сама — хоть на одном месте ловли. */
export function baitWorks(water: WaterBody, species: FishSpecies): boolean {
  return water.zones.some((z) => z.spawns.some((s) => s.species.id === species.id))
}

/** Водоёмы, где прикормка работает, — для описания. */
export function baitWaters(pack: ContentPack, bait: Bait): WaterBody[] {
  return pack.waters.filter((w) => baitWorks(w, bait.species))
}

/** Места ловли водоёма с учётом прикормки (или без неё) — в том виде, в каком их ждёт ядро. */
export function zonesFor(water: WaterBody, active: ActiveBait | null, now: number): CastZones {
  return isBaitActive(active, now) ? baitedZones(water, active.bait.species) : zoneSpawns(water)
}

/**
 * Места ловли под прикормкой на вид species:
 * - где рыба водится — её шанс поклёвки вдвое выше (но не больше 100%);
 * - где не водится — она подходит на прикормку с тем шансом, что у неё на ближнем «родном» месте без прикормки;
 * - остальные рыбы места делят оставшийся шанс в прежних пропорциях.
 * Если рыба в водоёме не водится вовсе, прикормка не действует — места как есть.
 * Вес в ответе — шанс в процентах.
 */
export function baitedZones(water: WaterBody, species: FishSpecies): CastZones {
  const home = water.zones.find((z) => z.spawns.some((s) => s.species.id === species.id))
  if (!home) return zoneSpawns(water)
  const homeChance = chanceOf(home.spawns, species)

  return water.zones.map((zone) => {
    const spawns = zone.spawns
    const chance = chanceOf(spawns, species)
    const target = chance > 0 ? Math.min(1, chance * BAIT_FACTOR) : homeChance
    // Шанс остальных рыб места вместе — до и после прикормки
    const restBefore = 1 - chance
    const restAfter = 1 - target
    const total = spawns.reduce((sum, s) => sum + s.rarity, 0)
    const result: FishSpawn[] = spawns
      .filter((s) => s.species.id !== species.id)
      .map((s) => ({ ...s, rarity: restBefore > 0 ? ((s.rarity / total) * restAfter * 100) / restBefore : 0 }))
    // Рост пришлой рыбы — как у местных: у берега мельче, на глубине крупнее
    const own = spawns.find((s) => s.species.id === species.id) ?? { species, sizeSkew: spawns[0]?.sizeSkew }
    result.push({ ...own, rarity: target * 100 })
    return result
  })
}

/** Шанс поклёвки вида на месте ловли, 0..1. */
export function chanceOf(spawns: readonly FishSpawn[], species: FishSpecies): number {
  const total = spawns.reduce((sum, s) => sum + s.rarity, 0)
  const own = spawns.filter((s) => s.species.id === species.id).reduce((sum, s) => sum + s.rarity, 0)
  return total > 0 ? own / total : 0
}
