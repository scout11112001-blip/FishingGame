/** Дистанция в единицах ядра → метры на экране. */
export const METERS_PER_UNIT = 30

export function toMeters(distance: number): number {
  return Math.max(0, Math.round(distance * METERS_PER_UNIT))
}

/** Глубина для подписи: «3,5 м». */
export function formatDepth(meters: number): string {
  return `${String(meters).replace('.', ',')} м`
}
