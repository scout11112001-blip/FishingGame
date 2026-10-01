import type { ContentPack, WaterBody } from './types.ts'

// Опыт: за каждую вытащенную рыбу, любого вида и размера. Открывает новые водоёмы.

export const XP_PER_FISH = 1

export function isWaterOpen(water: WaterBody, xp: number): boolean {
  return xp >= (water.unlockXp ?? 0)
}

/** Ближайший ещё закрытый водоём — к нему идёт полоска опыта. */
export function nextLockedWater(pack: ContentPack, xp: number): WaterBody | undefined {
  return pack.waters.filter((w) => !isWaterOpen(w, xp)).sort((a, b) => (a.unlockXp ?? 0) - (b.unlockXp ?? 0))[0]
}

/** Водоёмы, которые открылись, пока опыт рос с before до after. */
export function newlyOpened(pack: ContentPack, before: number, after: number): WaterBody[] {
  return pack.waters.filter((w) => !isWaterOpen(w, before) && isWaterOpen(w, after))
}
