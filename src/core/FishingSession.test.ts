import { describe, expect, it } from 'vitest'
import { makeFish, type FishSpecies } from './fish.ts'
import { castLevelRange, MAX_CAST_LEVELS, DEFAULT_TUNING, FishingSession, type FightView, type FishingEvent, type Phase, type Tackle } from './FishingSession.ts'
import { seededRng } from './rng.ts'

const TACKLE: Tackle = { lineStrength: 1, reelSpeed: 0.1, castLevels: MAX_CAST_LEVELS }

const small: FishSpecies = { id: 'small', name: 'Мелкая', minWeightKg: 1, maxWeightKg: 1, pricePerKg: 10, strength: 0.2 }
const big: FishSpecies = { id: 'big', name: 'Крупная', minWeightKg: 1, maxWeightKg: 1, pricePerKg: 10, strength: 1 }

const DT = 1 / 60

function makeSession(pool: FishSpecies[], seed = 1) {
  const session = new FishingSession({ zones: [pool.map((species) => ({ species, rarity: 1 }))], tackle: TACKLE, rng: seededRng(seed) })
  const events: FishingEvent[] = []
  session.on((e) => events.push(e))
  return { session, events }
}

function runUntil(session: FishingSession, done: () => boolean, maxSeconds = 300, each?: (f: FightView) => void) {
  for (let t = 0; t < maxSeconds; t += DT) {
    if (done()) return
    const f = session.fight
    if (f && session.phase === 'fighting') each?.(f)
    session.update(DT)
  }
  throw new Error(`не дождались условия, фаза ${session.phase}`)
}

/** Заброс к самому берегу. */
function tapCast(session: FishingSession) {
  session.castTo(0)
}

/** Заброс на всю дальность (нажатие без точки — как пробел на ПК), ожидание поклёвки и подсечка — сессия в бою, палец прижат. */
function hook(session: FishingSession) {
  session.press()
  runUntil(session, () => session.phase === 'bite')
  session.press()
}

/** Игрок, который держит усилие в середине зелёной зоны. counter — тянет против рыбы или в ту же сторону. */
function player(session: FishingSession, counter: boolean) {
  let down = true
  return (f: FightView) => {
    session.setRod(counter ? -f.fishX : Math.sign(f.fishX))
    const mid = (f.need + f.zoneTop) / 2
    const want = f.mode === 'rush' ? f.effort < f.need + 0.05 : down ? f.effort < mid + 0.05 : f.effort < mid - 0.05
    if (want && !down) session.press()
    if (!want && down) session.release()
    down = want
  }
}

function escapeReason(events: FishingEvent[]) {
  const e = events.find((e) => e.type === 'escaped')
  return e?.type === 'escaped' ? e.reason : undefined
}

describe('FishingSession: до подсечки', () => {
  it('заброс ведёт в ожидание, потом в поклёвку', () => {
    const { session, events } = makeSession([small])
    session.press()
    expect(session.phase).toBe('casting')
    runUntil(session, () => session.phase === 'bite')
    const phases = events.flatMap((e) => (e.type === 'phase' ? [e.phase] : []))
    expect(phases).toEqual<Phase[]>(['casting', 'waiting', 'bite'])
  })

  it('до поклёвки поплавок дёргается', () => {
    const session = new FishingSession({
      zones: [[{ species: small, rarity: 1 }]],
      tackle: TACKLE,
      rng: seededRng(3),
      tuning: { ...DEFAULT_TUNING, biteDelayMin: 6, biteDelayMax: 6 },
    })
    let nibbles = 0
    session.on((e) => e.type === 'nibble' && nibbles++)
    tapCast(session)
    runUntil(session, () => session.phase === 'bite')
    expect(nibbles).toBeGreaterThan(0)
  })

  it('подсечка до поклёвки спугивает рыбу', () => {
    const { session, events } = makeSession([small])
    tapCast(session)
    runUntil(session, () => session.phase === 'waiting')
    session.press()
    expect(escapeReason(events)).toBe('tooEarly')
  })

  it('без подсечки рыба уходит', () => {
    const { session, events } = makeSession([small])
    tapCast(session)
    runUntil(session, () => session.phase === 'bite')
    runUntil(session, () => session.phase !== 'bite')
    expect(escapeReason(events)).toBe('missed')
  })
})

describe('FishingSession: дальность заброса', () => {
  const zoneFish = (i: number): FishSpecies => ({ ...small, id: `zone${i}` })
  const zones = [0, 1, 2].map((i) => [{ species: zoneFish(i), rarity: 1 }])

  /** Заброс в точку и подсечка; возвращает сессию в бою и событие заброса. */
  function castAt(castLevels: number, distance: number) {
    const session = new FishingSession({ zones, tackle: { ...TACKLE, castLevels }, rng: seededRng(1) })
    const events: FishingEvent[] = []
    session.on((e) => events.push(e))
    session.castTo(distance, 0.5)
    runUntil(session, () => session.phase === 'bite')
    session.press()
    const cast = events.find((e) => e.type === 'cast')
    return { session, cast: cast?.type === 'cast' ? cast : undefined }
  }

  it('поплавок падает туда, куда нажали, и уровень берётся по дистанции', () => {
    for (let level = 0; level < 3; level++) {
      const [from, to] = castLevelRange(level, 3)
      const { session, cast } = castAt(3, (from + to) / 2)
      expect(session.cast).toBeCloseTo((from + to) / 2)
      expect(session.castX).toBe(0.5)
      expect(cast).toEqual({ type: 'cast', level, clamped: false })
    }
  })

  it('ближе берега не бросить', () => {
    expect(castAt(3, 0).session.cast).toBeCloseTo(DEFAULT_TUNING.castNear)
  })

  it('слабая удочка кладёт поплавок на свой предел и сообщает об этом', () => {
    const { session, cast } = castAt(1, DEFAULT_TUNING.castFar)
    expect(session.cast).toBeCloseTo(castLevelRange(0, 3)[1])
    expect(cast).toEqual({ type: 'cast', level: 0, clamped: true })
  })

  it('в водоёме с двумя местами двухуровневая удочка добрасывает до дальнего края, а места шире', () => {
    const session = new FishingSession({ zones: zones.slice(0, 2), tackle: { ...TACKLE, castLevels: 2 }, rng: seededRng(1) })
    expect(session.maxCast).toBeCloseTo(DEFAULT_TUNING.castFar)
    expect(castLevelRange(0, 2)[1] - castLevelRange(0, 2)[0]).toBeGreaterThan(castLevelRange(0, 3)[1] - castLevelRange(0, 3)[0])
    // Удочка дальнобойнее водоёма бросает до его последнего места — и не дальше
    const feeder = new FishingSession({ zones: zones.slice(0, 2), tackle: { ...TACKLE, castLevels: 3 }, rng: seededRng(1) })
    expect(feeder.castLevels).toBe(2)
    feeder.castTo(DEFAULT_TUNING.castFar)
    expect(feeder.castLevel).toBe(1)
  })

  it('нажатие без точки бросает на предел удочки без предупреждения', () => {
    const session = new FishingSession({ zones, tackle: { ...TACKLE, castLevels: 2 }, rng: seededRng(1) })
    const events: FishingEvent[] = []
    session.on((e) => events.push(e))
    session.press()
    expect(session.cast).toBeCloseTo(castLevelRange(1, 3)[1])
    expect(events).toContainEqual({ type: 'cast', level: 1, clamped: false })
  })

  it('клюёт рыба того уровня, куда упал поплавок', () => {
    const [near] = castLevelRange(0, 3)
    expect(castAt(3, near).session.fight!.fish.species.id).toBe('zone0')
    expect(castAt(2, DEFAULT_TUNING.castFar).session.fight!.fish.species.id).toBe('zone1')
    expect(castAt(3, DEFAULT_TUNING.castFar).session.fight!.fish.species.id).toBe('zone2')
  })
})

describe('FishingSession: вываживание', () => {
  it('игрок, держащий зелёную зону и тянущий против рыбы, её вытаскивает', () => {
    const { session, events } = makeSession([small])
    hook(session)
    runUntil(session, () => session.phase !== 'fighting', 300, player(session, true))
    expect(session.phase).toBe('caught')
    const caught = events.find((e) => e.type === 'caught')
    expect(caught?.type === 'caught' && caught.price).toBe(10)
  })

  it('если просто зажать палец, шкала заполняется и леска рвётся', () => {
    const { session, events } = makeSession([small])
    hook(session)
    runUntil(session, () => session.phase !== 'fighting', 300, (f) => session.setRod(-f.fishX))
    expect(escapeReason(events)).toBe('lineBroke')
  })

  it('если не держать палец, усилия не хватает и рыба сходит', () => {
    const { session, events } = makeSession([small])
    hook(session)
    session.release()
    runUntil(session, () => session.phase !== 'fighting')
    expect(escapeReason(events)).toBe('unhooked')
  })

  it('если тянуть в ту же сторону, что и рыба, она срывается вбок', () => {
    const { session, events } = makeSession([small])
    hook(session)
    runUntil(session, () => session.phase !== 'fighting', 300, player(session, false))
    expect(escapeReason(events)).toBe('wrongSide')
  })

  it('противодействие ускоряет подмотку, но не решает всё: без него рыба тоже подтягивается, пока не сорвётся', () => {
    const { session } = makeSession([small])
    hook(session)
    const start = session.fight!.distance
    // Палец держим строго по центру: противодействие среднее, срыв копится не сразу
    runUntil(session, () => session.phase !== 'fighting' || session.timeInPhase > 1.5, 300, (f) => {
      session.setRod(0)
      if (f.effort > (f.need + f.zoneTop) / 2) session.release()
      else session.press()
    })
    expect(session.fight!.distance).toBeLessThan(start)
  })

  it('чем сильнее рыба, тем выше нижняя граница зелёной зоны', () => {
    const a = makeSession([small]).session
    const b = makeSession([big]).session
    hook(a)
    hook(b)
    expect(b.fight!.need).toBeGreaterThan(a.fight!.need)
  })

  it('слабой рыбе порвать леску труднее: на пределе держится дольше', () => {
    // Самые крупные особи обоих видов; палец зажат всё время, считаем от первого касания предела до обрыва
    const secondsToBreak = (species: FishSpecies) => {
      const session = new FishingSession({
        zones: [[{ species, rarity: 1 }]],
        tackle: TACKLE,
        rng: seededRng(1),
        pickFish: () => makeFish(species, 1),
      })
      hook(session)
      let overLimit = 0
      runUntil(session, () => session.phase !== 'fighting', 300, (f) => {
        session.setRod(f.targetX)
        if (overLimit > 0 || f.effort >= 1) overLimit += DT
      })
      return overLimit
    }
    expect(secondsToBreak(small)).toBeGreaterThan(secondsToBreak(big) + 1)
  })

  it('перед рывком рыба предупреждает', () => {
    const { session } = makeSession([small])
    hook(session)
    const modes: string[] = []
    const play = player(session, true)
    runUntil(session, () => modes.includes('rush') || session.phase !== 'fighting', 300, (f) => {
      if (modes.at(-1) !== f.mode) modes.push(f.mode)
      play(f)
    })
    expect(modes.slice(0, 3)).toEqual(['calm', 'warn', 'rush'])
  })

  it('указатель сцены совпадает с механикой: в центре цели противодействие полное, на краю зоны — пороговое', () => {
    const { session } = makeSession([small])
    hook(session)
    session.update(1)
    const f = session.fight!
    session.setRod(f.targetX)
    expect(session.fight!.counter).toBeCloseTo(1)
    // Край зоны берём внутрь диапазона пальца, чтобы setRod не обрезал значение
    const edge = f.targetX + (f.targetX > 0 ? -1 : 1) * f.safeHalfWidth
    session.setRod(edge)
    expect(session.fight!.counter).toBeCloseTo(DEFAULT_TUNING.counterMin)
  })

  it('снасть и водоём меняются только между забросами', () => {
    const { session } = makeSession([small])
    const stronger = { ...TACKLE, lineStrength: 2 }
    hook(session)
    const needBefore = session.fight!.need
    expect(session.equip([[{ species: big, rarity: 1 }]], stronger)).toBe(false)
    session.update(DT)
    expect(session.fight!.need).toBeCloseTo(needBefore, 2)
  })

  it('после итога нажатие возвращает в начало', () => {
    const { session } = makeSession([small])
    hook(session)
    session.release()
    runUntil(session, () => session.phase === 'escaped')
    session.press()
    expect(session.phase).toBe('idle')
    expect(session.fight).toBeNull()
  })

  it('огромный шаг времени после паузы не проматывает вываживание', () => {
    const { session } = makeSession([small])
    hook(session)
    session.update(30)
    expect(session.phase).toBe('fighting')
  })
})
