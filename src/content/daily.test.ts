import { describe, expect, it } from 'vitest'
import { claimDaily, dailyOffer, dayKey, daysBetween, emptyDaily } from './daily.ts'
import { RIVERS } from './rivers/index.ts'

const DAYS = 4

/** Заходить по дням (сдвиг от 1 октября), забирая награду, если она есть. Возвращает, какой день серии выдан. */
function visit(offsets: number[]): (number | null)[] {
  let state = emptyDaily()
  return offsets.map((offset) => {
    const today = dayKey(new Date(2026, 9, 1 + offset))
    const index = dailyOffer(state, today, DAYS)
    if (index !== null) state = claimDaily(index, today)
    return index
  })
}

describe('награда за ежедневный вход', () => {
  it('дни подряд — серия растёт, после последнего снова с первого', () => {
    expect(visit([0, 1, 2, 3, 4, 5])).toEqual([0, 1, 2, 3, 0, 1])
  })

  it('второй заход за день ничего не даёт', () => {
    expect(visit([0, 0, 1, 1])).toEqual([0, null, 1, null])
  })

  it('пропустил день — серия сначала', () => {
    expect(visit([0, 1, 2, 4])).toEqual([0, 1, 2, 0])
    expect(visit([0, 1, 10])).toEqual([0, 1, 0])
  })

  it('часы перевели назад — серия сначала, но награду не запирает', () => {
    expect(visit([5, 6, 2])).toEqual([0, 1, 0])
  })

  it('дни считаются по датам: через границу месяца и года', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('награды рыбалки: 200 серебра, дальше прикормки на леща, судака и сома, в последний день — 500', () => {
    expect(RIVERS.daily.map((d) => [d.silver, d.bait?.species.name ?? null])).toEqual([
      [200, null],
      [200, 'Лещ'],
      [200, 'Судак'],
      [500, 'Сом'],
    ])
  })
})
