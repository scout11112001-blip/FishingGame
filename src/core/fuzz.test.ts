import { describe, expect, it } from 'vitest'
import { ALL_PACKS } from '../content/index.ts'
import { tackleOf, zoneSpawns } from '../content/types.ts'
import { makeFish } from './fish.ts'
import { DEFAULT_TUNING, FishingSession, type FightView, type FishingEvent, type Phase } from './FishingSession.ts'
import { seededRng, type Rng } from './rng.ts'

// Случайный игрок: жмёт и отпускает невпопад, водит пальцем куда попало, иногда бросает удочку на полпути.
// Ищем то, что обычные тесты с аккуратным ботом не ловят: зависший бой, NaN, выход за границы, неверный порядок фаз.

const DT = 1 / 60
/** Дольше этого бой не идёт ни при какой игре: иначе где-то вечный цикл. */
const MAX_FIGHT_SECONDS = 600

/** Из какой фазы куда можно перейти. */
const NEXT: Record<Phase, Phase[]> = {
  idle: ['casting'],
  casting: ['waiting'],
  waiting: ['bite', 'escaped'],
  bite: ['fighting', 'escaped'],
  fighting: ['caught', 'escaped'],
  caught: ['idle'],
  escaped: ['idle'],
}

/** Что не так с состоянием боя — или null. Без expect на каждый кадр: их десятки тысяч, а expect медленный. */
function badView(f: FightView): string | null {
  for (const [k, v] of Object.entries(f)) if (typeof v === 'number' && !Number.isFinite(v)) return `${k} = ${v}`
  if (f.effort < 0) return `effort = ${f.effort}`
  if (f.distance < 0 || f.distance > DEFAULT_TUNING.lineLength + 0.01) return `distance = ${f.distance}`
  for (const k of ['breakDanger', 'slackDanger', 'sideDanger', 'counter'] as const) if (f[k] < 0 || f[k] > 1) return `${k} = ${f[k]}`
  for (const k of ['fishX', 'rodX', 'targetX'] as const) if (Math.abs(f[k]) > 1 + 1e-9) return `${k} = ${f[k]}`
  if (f.need >= f.zoneTop) return `need ${f.need} ≥ zoneTop ${f.zoneTop}`
  return null
}

function checkView(f: FightView, where: string) {
  const bad = badView(f)
  if (bad) expect.fail(`${where}: ${bad}`)
}

/** Игрок-хаос: каждую долю секунды может сменить решение — держать или нет, куда вести палец. */
function chaosPlayer(session: FishingSession, rng: Rng) {
  let holding = false
  let target = 0
  return () => {
    if (rng() < 0.08) holding = !holding
    if (rng() < 0.05) target = rng() * 2 - 1
    session.setRod(target + (rng() - 0.5) * 0.2)
    if (holding) session.press()
    else session.release()
  }
}

describe.each(ALL_PACKS.map((p) => [p.id, p] as const))('случайный игрок, пакет %s', (_id, pack) => {
  it('бой всегда кончается, числа в порядке, фазы идут по порядку', { timeout: 60_000 }, () => {
    let fights = 0
    let caught = 0
    let longest = 0
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seededRng(seed * 7919)
      const water = pack.waters[seed % pack.waters.length]
      // Снасть — случайная из всех: и слабая против сильной рыбы, и наоборот
      const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)]
      const loadout = { rod: pick(pack.rods), line: pick(pack.lines), reel: pick(pack.reels) }
      const session = new FishingSession({ zones: zoneSpawns(water), tackle: tackleOf(loadout, water), rng: seededRng(seed) })
      const phases: Phase[] = ['idle']
      const results: FishingEvent[] = []
      session.on((e) => {
        if (e.type === 'phase') {
          const prev = phases.at(-1)!
          if (!NEXT[prev].includes(e.phase)) expect.fail(`переход ${prev} → ${e.phase}`)
          phases.push(e.phase)
        }
        if (e.type === 'caught' || e.type === 'escaped') results.push(e)
      })
      const play = chaosPlayer(session, rng)
      for (let cast = 0; cast < 5; cast++) {
        const before = results.length
        session.castTo(rng() * 1.2, rng() * 2 - 1)
        let t = 0
        while (session.phase !== 'caught' && session.phase !== 'escaped') {
          // Ждёт поклёвку, но иногда дёргает раньше времени — как нетерпеливый новичок
          if (session.phase === 'waiting' && rng() < 0.002) session.press()
          if (session.phase === 'bite' && rng() < 0.05) session.press()
          if (session.phase === 'fighting') {
            play()
            checkView(session.fight!, `пакет ${pack.id}, зерно ${seed}, заброс ${cast}, ${t.toFixed(1)} с`)
          }
          session.update(DT)
          t += DT
          if (t > MAX_FIGHT_SECONDS) expect.fail(`бой не кончился: зерно ${seed}, фаза ${session.phase}`)
        }
        longest = Math.max(longest, t)
        // Ровно один итог на заброс
        expect(results.length - before).toBe(1)
        if (results.at(-1)!.type === 'caught') caught++
        fights++
        session.press()
        expect(session.phase).toBe('idle')
        expect(session.fight).toBeNull()
      }
    }
    expect(fights).toBe(300)
    console.log(`случайный игрок: ${fights} забросов, поймано ${caught}, самый долгий ${longest.toFixed(0)} с`)
    // Хаос иногда всё же вытаскивает рыбу — иначе игра непроходима для неаккуратных
    expect(caught).toBeGreaterThan(0)
  })

  it('уход в меню в случайный момент: у заброса один итог или ни одного, дальше всё работает', { timeout: 60_000 }, () => {
    let casts = 0
    let leftMidCast = 0
    let leftFromResult = 0
    const leftIn = new Set<Phase>()
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed * 104_729)
      const water = pack.waters[seed % pack.waters.length]
      const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)]
      const loadout = { rod: pick(pack.rods), line: pick(pack.lines), reel: pick(pack.reels) }
      const session = new FishingSession({ zones: zoneSpawns(water), tackle: tackleOf(loadout, water), rng: seededRng(seed) })
      const phases: Phase[] = ['idle']
      let results = 0
      session.on((e) => {
        if (e.type === 'phase') {
          const prev = phases.at(-1)!
          // Уход в меню — из любой фазы, кроме покоя, сразу в покой; остальное — по обычному порядку
          if (!NEXT[prev].includes(e.phase) && !(e.phase === 'idle' && prev !== 'idle')) expect.fail(`переход ${prev} → ${e.phase}`)
          phases.push(e.phase)
        }
        if (e.type === 'caught' || e.type === 'escaped') results++
      })
      const play = chaosPlayer(session, rng)
      for (let cast = 0; cast < 10; cast++) {
        results = 0
        expect(session.castTo(rng() * 1.2, rng() * 2 - 1)).toBe(true)
        casts++
        // Когда уйти в меню: чаще — в первые секунды (полёт, ожидание, поклёвка), иногда — посреди боя, иногда — никогда
        const leaveAt = rng() < 0.7 ? rng() ** 2 * 40 : Infinity
        let left: Phase | null = null
        let t = 0
        for (;;) {
          if (t >= leaveAt) {
            left = session.phase
            expect(session.abort()).toBe(true)
            break
          }
          if (session.phase === 'caught' || session.phase === 'escaped') {
            // С экрана итога — то в меню, то дальше ловить
            if (rng() < 0.3) {
              left = session.phase
              session.abort()
            } else session.press()
            break
          }
          if (session.phase === 'waiting' && rng() < 0.002) session.press()
          if (session.phase === 'bite' && rng() < 0.05) session.press()
          if (session.phase === 'fighting') {
            play()
            checkView(session.fight!, `пакет ${pack.id}, зерно ${seed}, заброс ${cast}, ${t.toFixed(1)} с`)
          }
          session.update(DT)
          t += DT
          if (t > MAX_FIGHT_SECONDS) expect.fail(`бой не кончился: зерно ${seed}, фаза ${session.phase}`)
        }
        expect(session.phase).toBe('idle')
        expect(session.fight).toBeNull()
        // В покое после ухода ничего не происходит само: ни поклёвки, ни запоздалого итога
        const settled = results
        for (let i = 0; i < 180; i++) session.update(DT)
        expect(session.phase).toBe('idle')
        expect(results).toBe(settled)
        // Итог у заброса один; ушёл до итога — итога нет совсем
        expect(results).toBeLessThanOrEqual(1)
        const midCast = left !== null && left !== 'caught' && left !== 'escaped'
        expect(results).toBe(midCast ? 0 : 1)
        if (midCast) {
          leftMidCast++
          leftIn.add(left!)
        } else if (left) leftFromResult++
      }
    }
    expect(casts).toBe(400)
    console.log(`уход в меню: ${casts} забросов, ушёл посреди — ${leftMidCast} (${[...leftIn].join(', ')}), с экрана итога — ${leftFromResult}`)
    // Уходы и правда случались во всех фазах заброса
    for (const phase of ['casting', 'waiting', 'bite', 'fighting'] as Phase[]) expect(leftIn.has(phase), phase).toBe(true)
    expect(leftFromResult).toBeGreaterThan(0)
  })

  it('огромные и нулевые шаги времени не ломают бой', () => {
    const water = pack.waters[0]
    const session = new FishingSession({ zones: zoneSpawns(water), tackle: tackleOf(pack.starter, water), rng: seededRng(5) })
    session.press()
    for (const dt of [0, 1e9, -5, 0.1, 0, 1e-12]) session.update(dt)
    let t = 0
    while (session.phase !== 'bite') {
      session.update(DT)
      t += DT
      expect(t).toBeLessThan(60)
    }
    session.press()
    for (const dt of [0, 1e9, -5, 1e-12]) {
      session.update(dt)
      if (session.fight) checkView(session.fight, `шаг ${dt}`)
    }
  })

  it('самая крупная рыба каждого вида на самой слабой снасти — бой тоже кончается', () => {
    for (const species of pack.fish) {
      const water = pack.waters.find((w) => w.zones.some((z) => z.spawns.some((s) => s.species === species)))!
      const session = new FishingSession({
        zones: [[{ species, rarity: 1 }]],
        tackle: tackleOf(pack.starter, water),
        rng: seededRng(11),
        pickFish: () => makeFish(species, 1),
      })
      // Фазу читаем через функцию: TypeScript не знает, что press() её меняет
      const phase = () => session.phase
      session.press()
      while (phase() !== 'bite') session.update(DT)
      session.press()
      let t = 0
      // Держит и тянет против рыбы — лучшее, что можно сделать слабой снастью
      while (phase() === 'fighting') {
        const f = session.fight!
        session.setRod(-f.fishX)
        if (f.effort < (f.need + f.zoneTop) / 2) session.press()
        else session.release()
        session.update(DT)
        t += DT
        if (t > MAX_FIGHT_SECONDS) expect.fail(`${species.name}: бой не кончился`)
      }
    }
  })
})
