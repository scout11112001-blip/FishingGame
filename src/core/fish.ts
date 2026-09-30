import { pickWeighted, type Rng } from './rng.ts'

export interface FishSpecies {
  id: string
  name: string
  minWeightKg: number
  maxWeightKg: number
  pricePerKg: number
  /** Сила рывков самой крупной особи, в долях разрывного натяжения лески (0..1+). */
  strength: number
}

/** Вид рыбы в конкретном водоёме: одна и та же щука в пруду редкость, а в озере обычна. */
export interface FishSpawn {
  species: FishSpecies
  /** Относительный шанс поклёвки среди рыб водоёма. */
  rarity: number
  /**
   * Насколько водоём тянет размер к мелочи: размер = случайное(0..1) ^ sizeSkew.
   * 1 — все размеры равновероятны, больше — чаще мелкие. По умолчанию DEFAULT_SIZE_SKEW.
   */
  sizeSkew?: number
}

export const DEFAULT_SIZE_SKEW = 2

/** Конкретная рыба на крючке: вид плюс выпавший размер и производные от него параметры. */
export interface HookedFish {
  species: FishSpecies
  weightKg: number
  /** Сила рывков этой особи (0..1+), 1 — рвёт леску даже без подмотки. */
  power: number
}

export function rollFish(rng: Rng, spawns: readonly FishSpawn[]): HookedFish {
  const { species, sizeSkew = DEFAULT_SIZE_SKEW } = pickWeighted(rng, spawns, (s) => s.rarity)
  return makeFish(species, rng() ** sizeSkew)
}

/** Особь заданного размера: 0 — самая мелкая для вида, 1 — самая крупная. */
export function makeFish(species: FishSpecies, size: number): HookedFish {
  const weightKg = species.minWeightKg + (species.maxWeightKg - species.minWeightKg) * size
  // Мелкая особь вида всё равно не нулевая по силе
  const sizeFactor = 0.4 + 0.6 * size
  return {
    species,
    weightKg: Math.round(weightKg * 100) / 100,
    power: species.strength * sizeFactor,
  }
}

export function fishPrice(fish: HookedFish): number {
  return Math.max(1, Math.round(fish.weightKg * fish.species.pricePerKg))
}
