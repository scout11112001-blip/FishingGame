/** Дистанция в единицах ядра → метры на экране. */
export const METERS_PER_UNIT = 30

export function toMeters(distance: number): number {
  return Math.max(0, Math.round(distance * METERS_PER_UNIT))
}

/** Сумма серебра: «72 000» — с неразрывным пробелом между тысячами. */
export function formatSilver(amount: number): string {
  return Math.round(amount).toLocaleString('ru-RU')
}

/** Глубина для подписи: «3,5 м». */
export function formatDepth(meters: number): string {
  return `${String(meters).replace('.', ',')} м`
}

/** Оставшееся время: «1 ч 45 мин», «2 ч», «12 мин». Неполная минута округляется вверх — «0 мин» не бывает. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}
