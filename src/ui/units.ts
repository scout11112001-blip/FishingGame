/** Дистанция в единицах ядра → метры на экране. */
export const METERS_PER_UNIT = 30

export function toMeters(distance: number): number {
  return Math.max(0, Math.round(distance * METERS_PER_UNIT))
}
