import { describe, expect, it } from 'vitest'
import type { Phase } from '../core/FishingSession.ts'
import { menuAccess } from './menu.ts'

const ALL: Phase[] = ['idle', 'casting', 'waiting', 'bite', 'fighting', 'caught', 'escaped']

describe('кнопка главного меню', () => {
  it.each(ALL)('в обучении недоступна ни в какой фазе: %s', (phase) => {
    expect(menuAccess(phase, true)).toBe('none')
  })

  it.each(['idle', 'caught', 'escaped'] as Phase[])('между забросами и на экране итога (%s) — сразу в меню', (phase) => {
    expect(menuAccess(phase, false)).toBe('open')
  })

  it.each(['casting', 'waiting', 'bite', 'fighting'] as Phase[])('посреди заброса (%s) — сначала вопрос', (phase) => {
    expect(menuAccess(phase, false)).toBe('confirm')
  })

  it('после обучения меню доступно в любой фазе', () => {
    for (const phase of ALL) expect(menuAccess(phase, false)).not.toBe('none')
  })
})
