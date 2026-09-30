import { DEFAULT_SIZE_SKEW, makeFish, type FishSpawn, type FishSpecies, type HookedFish } from '../core/fish.ts'
import { castLevelRange, FishingSession, type EscapeReason, type FightView, type Tackle, type Tuning } from '../core/FishingSession.ts'
import { seededRng } from '../core/rng.ts'

// Прогон боёв без графики: бот-игрок против ядра. Используется тестами контента и скриптом баланса.

const DT = 1 / 60
const MAX_FIGHT_SECONDS = 300

/**
 * Бот, играющий «как аккуратный человек»: видит состояние с задержкой реакции,
 * держит усилие в середине зелёной зоны, на рывке сбрасывает до нижней границы, ведёт палец в цель.
 */
export function makeBot(session: FishingSession, reactionSeconds: number): (f: FightView) => void {
  const seen: FightView[] = []
  const lag = Math.round(reactionSeconds / DT)
  let down = true
  return (now) => {
    seen.push(now)
    const f = seen[Math.max(0, seen.length - 1 - lag)]
    session.setRod(f.targetX)
    const mid = (f.need + f.zoneTop) / 2
    const want = f.mode === 'rush' ? f.effort < f.need + 0.05 : down ? f.effort < mid + 0.05 : f.effort < mid - 0.05
    if (want && !down) session.press()
    if (!want && down) session.release()
    down = want
  }
}

const mean = ([a, b]: [number, number]) => (a + b) / 2

export interface FightOutcome {
  result: 'caught' | EscapeReason
  seconds: number
  fish: HookedFish
}

export interface FightSetup {
  tackle: Tackle
  seed: number
  reactionSeconds?: number
  tuning?: Tuning
  /** Куда бросает бот: в середину уровня level из levels мест ловли. По умолчанию — так далеко, как добросит удочка. */
  cast?: { level: number; levels: number }
}

/** Один бой с заданной особью: заброс, подсечка сразу после поклёвки, дальше играет бот. */
export function simulateFight(fish: HookedFish, setup: FightSetup): FightOutcome {
  const session = new FishingSession({
    zones: [[{ species: fish.species, rarity: 1 }]],
    tackle: setup.tackle,
    rng: seededRng(setup.seed),
    tuning: setup.tuning,
    pickFish: () => fish,
  })
  let result: FightOutcome['result'] = 'caught'
  session.on((e) => {
    if (e.type === 'escaped') result = e.reason
  })

  // Фазу читаем через функцию: иначе TypeScript сужает тип после первого цикла и не видит смены фазы после press()
  const phase = () => session.phase
  // В середину нужного уровня; без уровня — так далеко, как добрасывает удочка
  if (!setup.cast) session.press()
  else session.castTo(mean(castLevelRange(setup.cast.level, setup.cast.levels, setup.tuning)))
  while (phase() !== 'bite') session.update(DT)
  session.press()

  const bot = makeBot(session, setup.reactionSeconds ?? 0.5)
  let seconds = 0
  while (phase() === 'fighting' && seconds < MAX_FIGHT_SECONDS) {
    bot(session.fight!)
    session.update(DT)
    seconds += DT
  }
  return { result, seconds, fish }
}

export interface Summary {
  fights: number
  catchRate: number
  /** Средняя длительность удачного боя, секунды. */
  avgSeconds: number
  reasons: Partial<Record<FightOutcome['result'], number>>
}

export function summarize(outcomes: readonly FightOutcome[]): Summary {
  const reasons: Summary['reasons'] = {}
  let caught = 0
  let seconds = 0
  for (const o of outcomes) {
    reasons[o.result] = (reasons[o.result] ?? 0) + 1
    if (o.result === 'caught') {
      caught++
      seconds += o.seconds
    }
  }
  return {
    fights: outcomes.length,
    catchRate: outcomes.length ? caught / outcomes.length : 0,
    avgSeconds: caught ? seconds / caught : 0,
    reasons,
  }
}

/** Бои с особями случайного размера (как в игре), по n на вид. */
export function simulateSpecies(spawn: FishSpawn, setup: Omit<FightSetup, 'seed'>, n: number, seed = 1): Summary {
  const skew = spawn.sizeSkew ?? DEFAULT_SIZE_SKEW
  const outcomes: FightOutcome[] = []
  for (let i = 0; i < n; i++) {
    const rng = seededRng(seed * 7919 + i)
    outcomes.push(simulateFight(makeFish(spawn.species, rng() ** skew), { ...setup, seed: seed + i }))
  }
  return summarize(outcomes)
}

/** Бои с самой крупной особью вида — худший случай для проверки «ловится ли вообще». */
export function simulateLargest(species: FishSpecies, setup: Omit<FightSetup, 'seed'>, n: number, seed = 1): Summary {
  const fish = makeFish(species, 1)
  return summarize(Array.from({ length: n }, (_, i) => simulateFight(fish, { ...setup, seed: seed + i })))
}

/** Доля рыбы водоёма в улове с учётом частоты поклёвок. */
export function spawnShare(spawns: readonly FishSpawn[], species: FishSpecies): number {
  const total = spawns.reduce((sum, s) => sum + s.rarity, 0)
  return (spawns.find((s) => s.species === species)?.rarity ?? 0) / total
}
