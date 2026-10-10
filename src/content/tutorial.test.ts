import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from '../core/FishingSession.ts'
import { FIRST_CATCH_TUNING, Tutorial, TUTORIAL_TUNING, type TutorialStepId } from './tutorial.ts'

const id = (t: Tutorial) => t.step?.id ?? null

/** Первый вылов целиком: от карточки мест ловли до закрытой карточки опыта. */
function firstCatch(t: Tutorial) {
  t.next()
  t.onPhase('casting')
  t.onPhase('waiting')
  t.next()
  t.onPhase('bite')
  t.onPhase('fighting')
  t.next()
  t.next()
  t.next()
  t.onPhase('caught')
  t.next()
  t.next()
}

describe('обучение: первый вылов', () => {
  it('идёт по шагам: места ловли → заброс → ожидание → поклёвка → шкала → рамка → серебро → опыт', () => {
    const t = new Tutorial()
    const seen: (TutorialStepId | null)[] = [id(t)]
    const tap = () => {
      t.next()
      seen.push(id(t))
    }
    tap() // места ловли → заброс
    t.onPhase('casting')
    seen.push(id(t))
    t.onPhase('waiting')
    seen.push(id(t))
    tap()
    t.onPhase('bite')
    seen.push(id(t))
    t.onPhase('fighting')
    seen.push(id(t))
    tap()
    tap()
    tap()
    t.onPhase('caught')
    seen.push(id(t))
    tap()
    tap()
    expect(seen).toEqual(['zones', 'cast', null, 'wait', null, 'bite', 'tension', 'tensionHold', 'slider', null, 'silver', 'xp', null])
    // Впереди второй вылов
    expect(t.done).toBe(false)
  })

  it('рыба в первом вылове не рвёт, и про рывок не говорим', () => {
    const t = new Tutorial()
    expect(t.tuning).toBe(FIRST_CATCH_TUNING)
    expect(t.tuning.rushes).toBe(false)
    t.next()
    t.onPhase('casting')
    t.onRushWarning()
    expect(id(t)).toBeNull()
  })

  it('объяснения — когда игра стоит; заброс ждёт действия игрока, а не тапа по карточке', () => {
    const t = new Tutorial()
    expect(t.frozen).toBe(true)
    t.next()
    expect(id(t)).toBe('cast')
    expect(t.frozen).toBe(false)
    // Тап по карточке заброса не закрывает: закроет сам заброс
    expect(t.next()).toBeNull()
    expect(id(t)).toBe('cast')
  })

  it('поклёвка ждёт подсечки, а не тапа по карточке, и игра на ней стоит', () => {
    const t = new Tutorial()
    t.next()
    t.onPhase('bite')
    expect(t.frozen).toBe(true)
    expect(t.next()).toBeNull()
    t.onPhase('fighting')
    expect(id(t)).toBe('tension')
  })

  it('после схода — снова заброс, но без повтора уже объяснённого', () => {
    const t = new Tutorial()
    t.next()
    t.onPhase('casting')
    t.onPhase('waiting')
    t.next()
    t.onPhase('bite')
    t.onPhase('fighting')
    t.next()
    t.next()
    t.next()
    t.onPhase('escaped')
    expect(id(t)).toBe('escaped')
    t.next()
    expect(id(t)).toBe('cast')

    t.onPhase('casting')
    t.onPhase('waiting')
    expect(id(t)).toBeNull()
    t.onPhase('bite')
    expect(id(t)).toBe('bite')
    t.onPhase('fighting')
    expect(id(t)).toBeNull()
    expect(t.tuning).toBe(FIRST_CATCH_TUNING)
  })
})

describe('обучение: второй вылов', () => {
  it('рыба рвёт, подсказка — только про рывок, и один раз', () => {
    const t = new Tutorial()
    firstCatch(t)
    expect(t.tuning).toBe(TUTORIAL_TUNING)
    expect(t.tuning.rushes).toBe(true)

    for (const phase of ['casting', 'waiting', 'bite', 'fighting'] as const) {
      t.onPhase(phase)
      expect(id(t)).toBeNull()
    }
    t.onRushWarning()
    expect(id(t)).toBe('rush')
    expect(t.frozen).toBe(true)
    t.next()
    t.onRushWarning()
    expect(id(t)).toBeNull()
  })

  it('сход — без карточек: обычный экран итога', () => {
    const t = new Tutorial()
    firstCatch(t)
    t.onPhase('escaped')
    expect(id(t)).toBeNull()
    expect(t.done).toBe(false)
  })

  it('поймал — обучение пройдено, настройки обычные', () => {
    const t = new Tutorial()
    firstCatch(t)
    t.onPhase('caught')
    expect(t.done).toBe(true)
    expect(id(t)).toBeNull()
    expect(t.tuning).toBe(DEFAULT_TUNING)
  })

  it('перезашёл после первой рыбы — начинаем со второго вылова', () => {
    const t = new Tutorial(true)
    expect(id(t)).toBeNull()
    expect(t.tuning).toBe(TUTORIAL_TUNING)
    t.onPhase('waiting')
    t.onPhase('fighting')
    expect(id(t)).toBeNull()
    t.onRushWarning()
    expect(id(t)).toBe('rush')
  })

  it('после конца обучения на игру больше не реагирует', () => {
    const t = new Tutorial(true)
    t.onPhase('caught')
    t.onPhase('escaped')
    t.onPhase('bite')
    t.onRushWarning()
    expect(id(t)).toBeNull()
  })
})
