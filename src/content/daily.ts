import type { Bait } from './types.ts'

// Награда за ежедневный вход: серия дней подряд, у каждого дня своя награда.
// Пропустил день — серия сначала; прошёл все дни — снова с первого. Ничего не знает об интерфейсе.

export interface DailyReward {
  silver: number
  bait?: Bait
}

/** Что сохраняем: в какой день забрана последняя награда и сколько дней подряд. */
export interface DailyState {
  /** Местная дата игрока «ГГГГ-ММ-ДД»; null — ещё ни разу не забирал. */
  lastDay: string | null
  /** Сколько дней серии забрано, считая lastDay. */
  streak: number
}

export function emptyDaily(): DailyState {
  return { lastDay: null, streak: 0 }
}

/** День по часам устройства игрока: новый день начинается в его полночь. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Сколько календарных дней от a до b (обе — dayKey). Переходы на летнее время не мешают: считаем по датам. */
export function daysBetween(a: string, b: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/**
 * Какой день серии можно забрать сегодня (0 — первый), или null — сегодня уже забрано.
 * Вчера забирал — следующий день серии; пропустил день или больше — первый.
 * Дата сохранения «из будущего» (часы переводили назад) тоже начинает серию заново, а не запирает награду.
 */
export function dailyOffer(state: DailyState, today: string, days: number): number | null {
  if (!state.lastDay) return 0
  const gap = daysBetween(state.lastDay, today)
  if (gap === 0) return null
  return gap === 1 ? state.streak % days : 0
}

/** Забрать награду дня index — новое состояние серии. */
export function claimDaily(index: number, today: string): DailyState {
  return { lastDay: today, streak: index + 1 }
}
