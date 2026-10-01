import { describe, expect, it } from 'vitest'
import { Tutorial, type TutorialStepId } from './tutorial.ts'

const id = (t: Tutorial) => t.step?.id ?? null

describe('обучение на первом забросе', () => {
  it('идёт по шагам: места ловли → заброс → ожидание → поклёвка → шкала → рамка → рывок → серебро → опыт → кнопки', () => {
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
    t.onRushWarning()
    seen.push(id(t))
    tap()
    t.onPhase('caught')
    seen.push(id(t))
    for (let i = 0; i < 6; i++) tap()
    expect(seen).toEqual([
      'zones', 'cast', null, 'wait', null, 'bite', 'tension', 'tensionHold', 'slider', null, 'rush', null,
      'silver', 'xp', 'tackleButton', 'waterButton', 'baitButton', 'achievementsButton', null,
    ])
    expect(t.done).toBe(true)
  })

  it('кнопки меню видны только на шагах про них', () => {
    const t = new Tutorial()
    expect(t.step?.hud).toBeFalsy()
    t.onPhase('caught')
    t.next()
    expect(t.step?.hud).toBeFalsy() // карточка опыта — ещё на экране улова
    t.next()
    expect(id(t)).toBe('tackleButton')
    expect(t.step?.hud).toBe(true)
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
    expect(t.done).toBe(false)
  })

  it('рывок объясняется один раз и не перебивает другой шаг', () => {
    const t = new Tutorial()
    t.onRushWarning()
    expect(id(t)).toBe('zones')
    t.next()
    t.onPhase('casting')
    t.onRushWarning()
    expect(id(t)).toBe('rush')
    t.next()
    t.onRushWarning()
    expect(id(t)).toBeNull()
  })

  it('после конца обучения на игру больше не реагирует', () => {
    const t = new Tutorial()
    t.onPhase('caught')
    for (let i = 0; i < 6; i++) t.next()
    expect(t.done).toBe(true)
    t.onPhase('escaped')
    t.onPhase('bite')
    t.onRushWarning()
    expect(id(t)).toBeNull()
  })
})
