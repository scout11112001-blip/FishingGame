import { fishPrice, rollFish, type FishSpawn, type HookedFish } from './fish.ts'
import { randRange, type Rng } from './rng.ts'

export type Phase = 'idle' | 'casting' | 'waiting' | 'bite' | 'fighting' | 'caught' | 'escaped'

export type EscapeReason =
  | 'tooEarly' // подсёк до поклёвки — спугнул
  | 'missed' // не успел подсечь
  | 'lineBroke' // слишком долго держал усилие на пределе
  | 'unhooked' // усилия не хватало — рыба сошла
  | 'lineOut' // рыба смотала всю леску
  | 'wrongSide' // долго тянул не в ту сторону — рыба сорвалась вбок

export type FishingEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'nibble' }
  | { type: 'caught'; fish: HookedFish; price: number }
  | { type: 'escaped'; reason: EscapeReason; fish: HookedFish | null }

/** Снасть. */
export interface Tackle {
  /** Прочность лески: делит силу рыбы, то есть ослабляет рывки и опускает зелёную зону. */
  lineStrength: number
  /** Скорость подмотки при идеальном противодействии, долей дистанции в секунду. */
  reelSpeed: number
  /** Дальность заброса (0..1, где 1 — у горизонта). */
  castMin: number
  castMax: number
}

/** Поведение рыбы в бою: спокойно водит из стороны в сторону → предупреждает → рвёт в другую сторону. */
export type FishMode = 'calm' | 'warn' | 'rush'

export interface Tuning {
  castDuration: number
  biteDelayMin: number
  biteDelayMax: number
  nibbleGapMin: number
  nibbleGapMax: number
  /** Сколько секунд даётся на подсечку после поклёвки. */
  hookWindow: number
  /** Усилие сразу после подсечки. */
  hookEffort: number

  /** Рост усилия при зажатом пальце, долей шкалы в секунду. */
  effortRise: number
  /** Спад усилия при отпущенном пальце, долей шкалы в секунду. */
  effortFall: number
  /** Нижняя граница зелёной зоны: needBase + needPerPower × сила рыбы. */
  needBase: number
  needPerPower: number
  /** Верх зелёной зоны. Выше — красная; на 1 рвётся леска. */
  zoneTop: number
  /** Сколько усилия в секунду добавляет рывок рыбы силой 1. */
  rushGain: number

  calmMin: number
  calmMax: number
  /** Сколько длится предупреждение перед рывком. */
  rushWarn: number
  rushMin: number
  rushMax: number
  /** Как часто спокойная рыба меняет сторону. */
  sideSwitchMin: number
  sideSwitchMax: number
  /** Скорость ухода рыбы вбок, долей полуширины в секунду. */
  lateralSpeed: number
  lateralSpeedRush: number
  /** Расхождение |палец + рыба|, при котором противодействие падает до нуля. */
  counterTolerance: number
  /** Какая доля скорости подмотки зависит от противодействия (остальное — от усилия в зоне). */
  counterReelShare: number
  /** Ниже этого противодействия копится срыв вбок. */
  counterMin: number
  sideGrace: number

  /** Замедление подмотки от веса: скорость делится на (1 + weightDrag × кг). */
  weightDrag: number
  /** Как быстро рыба силой 1 утаскивает леску на рывке, долей дистанции в секунду. */
  fishRunSpeed: number
  slackGrace: number
  /** Сколько секунд сильная рыба (сила ≥ 1 относительно лески) терпит усилие на пределе до обрыва. */
  breakGrace: number
  /** Сколько секунд добавляется слабой рыбе: слабая рыба не может порвать леску так же быстро, как сильная. */
  breakGraceWeakBonus: number
  /** Сила рыбы (относительно лески), начиная с которой бонус к запасу исчезает. */
  weakPowerLimit: number
  /** Дистанция, на которой кончается леска. */
  lineLength: number
}

export const DEFAULT_TUNING: Tuning = {
  castDuration: 0.7,
  biteDelayMin: 2.5,
  biteDelayMax: 7,
  nibbleGapMin: 0.8,
  nibbleGapMax: 2,
  hookWindow: 0.9,
  hookEffort: 0.3,

  effortRise: 0.25,
  effortFall: 0.2,
  needBase: 0.25,
  needPerPower: 0.4,
  zoneTop: 0.85,
  rushGain: 0.8,

  calmMin: 4,
  calmMax: 7,
  rushWarn: 1.3,
  rushMin: 1.5,
  rushMax: 2.5,
  sideSwitchMin: 4,
  sideSwitchMax: 7,
  lateralSpeed: 0.2,
  lateralSpeedRush: 0.55,
  counterTolerance: 0.8,
  counterReelShare: 0.3,
  counterMin: 0.4,
  sideGrace: 2,

  weightDrag: 0.2,
  fishRunSpeed: 0.08,
  slackGrace: 3,
  breakGrace: 0.8,
  breakGraceWeakBonus: 2,
  weakPowerLimit: 0.5,
  lineLength: 1.5,
}

/** Состояние вываживания, которое рисует сцена. Усилие нормировано: 1 — обрыв лески. */
export interface FightView {
  readonly fish: HookedFish
  /** Текущее усилие, 0..1+. */
  readonly effort: number
  /** Нижняя граница зелёной зоны для этой рыбы сейчас. */
  readonly need: number
  /** Верхняя граница зелёной зоны. */
  readonly zoneTop: number
  readonly distance: number
  readonly mode: FishMode
  /** Куда ушла рыба: -1 — влево до упора, 1 — вправо. */
  readonly fishX: number
  /** Куда отведён палец игрока, -1..1. */
  readonly rodX: number
  /** Насколько хорошо игрок противодействует рыбе, 0..1. */
  readonly counter: number
  /** Где палец противодействует идеально (зеркально рыбе), -1..1. */
  readonly targetX: number
  /** Полуширина зоны вокруг targetX, где срыв вбок не копится. */
  readonly safeHalfWidth: number
  readonly holding: boolean
  /** Насколько близко обрыв (0..1). */
  readonly breakDanger: number
  /** Насколько близко сход (0..1). */
  readonly slackDanger: number
  /** Насколько близко срыв вбок (0..1) — копится, пока палец не против рыбы. */
  readonly sideDanger: number
}

interface FightState {
  fish: HookedFish
  effort: number
  distance: number
  mode: FishMode
  modeLeft: number
  fishX: number
  fishTargetX: number
  sideLeft: number
  breakTimer: number
  slackTimer: number
  sideTimer: number
}

export interface SessionOptions {
  /** Какая рыба водится там, где рыбачим. */
  spawns: readonly FishSpawn[]
  tackle: Tackle
  rng?: Rng
  tuning?: Tuning
  /** Кто клюнет. По умолчанию — случайная рыба из spawns; подменяется в тестах и симуляции. */
  pickFish?: (rng: Rng, spawns: readonly FishSpawn[]) => HookedFish
}

/**
 * Один цикл рыбалки: заброс → ожидание → поклёвка → вываживание → итог.
 * Управление: press/release (палец прижат или нет) и setRod (куда отведён палец). Ничего не знает о графике.
 */
export class FishingSession {
  private _phase: Phase = 'idle'
  private phaseTime = 0
  private castDistance = 0
  private biteAt = 0
  private nextNibbleAt = 0
  private hooked: HookedFish | null = null
  private fightState: FightState | null = null
  private holding = false
  private rodX = 0
  private listeners: ((e: FishingEvent) => void)[] = []
  private spawns: readonly FishSpawn[]
  private tackle: Tackle
  private readonly rng: Rng
  private readonly tuning: Tuning
  private readonly pickFish: (rng: Rng, spawns: readonly FishSpawn[]) => HookedFish

  constructor(options: SessionOptions) {
    this.spawns = options.spawns
    this.tackle = options.tackle
    this.rng = options.rng ?? Math.random
    this.tuning = options.tuning ?? DEFAULT_TUNING
    this.pickFish = options.pickFish ?? rollFish
  }

  /** Сменить водоём и снасть. Только между забросами: посреди боя менять леску нельзя. */
  equip(spawns: readonly FishSpawn[], tackle: Tackle): boolean {
    if (this._phase !== 'idle') return false
    this.spawns = spawns
    this.tackle = tackle
    return true
  }

  get phase(): Phase {
    return this._phase
  }

  /** Время в текущей фазе, секунды. */
  get timeInPhase(): number {
    return this.phaseTime
  }

  /** Прогресс полёта поплавка при забросе, 0..1. */
  get castProgress(): number {
    if (this._phase === 'casting') return Math.min(this.phaseTime / this.tuning.castDuration, 1)
    return this._phase === 'idle' ? 0 : 1
  }

  /** Сколько осталось на подсечку, 0..1 (1 — только клюнуло). */
  get hookWindowLeft(): number {
    return this._phase === 'bite' ? Math.max(0, 1 - this.phaseTime / this.tuning.hookWindow) : 0
  }

  /** Куда улетел поплавок (0..1). */
  get cast(): number {
    return this.castDistance
  }

  get fight(): FightView | null {
    const f = this.fightState
    if (!f) return null
    return {
      fish: f.fish,
      effort: f.effort,
      need: this.need(f),
      zoneTop: this.tuning.zoneTop,
      distance: f.distance,
      mode: f.mode,
      fishX: f.fishX,
      rodX: this.rodX,
      counter: this.counter(f),
      targetX: -f.fishX,
      safeHalfWidth: this.tuning.counterTolerance * (1 - this.tuning.counterMin),
      holding: this.holding,
      breakDanger: Math.min(f.breakTimer / this.breakGrace(f), 1),
      slackDanger: Math.min(f.slackTimer / this.tuning.slackGrace, 1),
      sideDanger: Math.min(f.sideTimer / this.tuning.sideGrace, 1),
    }
  }

  on(listener: (e: FishingEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  press(): void {
    switch (this._phase) {
      case 'idle':
        this.startCast()
        break
      case 'waiting':
        this.escape('tooEarly')
        break
      case 'bite':
        this.startFight()
        this.holding = true
        break
      case 'fighting':
        this.holding = true
        break
      case 'caught':
      case 'escaped':
        this.hooked = null
        this.fightState = null
        this.setPhase('idle')
        break
      case 'casting':
        break
    }
  }

  release(): void {
    this.holding = false
  }

  /** Куда отведён палец: -1 — левый край, 1 — правый. Работает в любой фазе, запоминается. */
  setRod(x: number): void {
    this.rodX = clamp(x, -1, 1)
  }

  update(dtSeconds: number): void {
    // Ограничиваем шаг: после паузы вкладки не должно пролетать полсекунды вываживания разом
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1)
    this.phaseTime += dt
    const t = this.tuning

    switch (this._phase) {
      case 'casting':
        if (this.phaseTime >= t.castDuration) this.startWaiting()
        break
      case 'waiting':
        if (this.phaseTime >= this.biteAt) {
          this.hooked = this.pickFish(this.rng, this.spawns)
          this.setPhase('bite')
        } else if (this.phaseTime >= this.nextNibbleAt) {
          this.emit({ type: 'nibble' })
          this.nextNibbleAt += randRange(this.rng, t.nibbleGapMin, t.nibbleGapMax)
        }
        break
      case 'bite':
        if (this.phaseTime >= t.hookWindow) this.escape('missed')
        break
      case 'fighting':
        this.stepFight(dt)
        break
    }
  }

  private startCast() {
    this.castDistance = randRange(this.rng, this.tackle.castMin, this.tackle.castMax)
    this.setPhase('casting')
  }

  private startWaiting() {
    const t = this.tuning
    this.biteAt = randRange(this.rng, t.biteDelayMin, t.biteDelayMax)
    this.nextNibbleAt = randRange(this.rng, t.nibbleGapMin, t.nibbleGapMax)
    this.setPhase('waiting')
  }

  private startFight() {
    const t = this.tuning
    const fish = this.hooked!
    const side = this.rng() < 0.5 ? -1 : 1
    this.fightState = {
      fish,
      effort: t.hookEffort,
      distance: this.castDistance,
      mode: 'calm',
      modeLeft: randRange(this.rng, t.calmMin, t.calmMax),
      fishX: 0,
      fishTargetX: side * randRange(this.rng, 0.4, 0.8),
      sideLeft: randRange(this.rng, t.sideSwitchMin, t.sideSwitchMax),
      breakTimer: 0,
      slackTimer: 0,
      sideTimer: 0,
    }
    this.setPhase('fighting')
  }

  /** Сила рыбы относительно лески: от неё зависят зелёная зона, рывки и запас до обрыва. */
  private effectivePower(f: FightState): number {
    return f.fish.power / this.tackle.lineStrength
  }

  /** Запас времени на пределе до обрыва: слабой рыбе (мелочь, начальные водоёмы) порвать леску труднее. */
  private breakGrace(f: FightState): number {
    const t = this.tuning
    const weakness = clamp(1 - this.effectivePower(f) / t.weakPowerLimit, 0, 1)
    return t.breakGrace + t.breakGraceWeakBonus * weakness
  }

  private need(f: FightState): number {
    const t = this.tuning
    // Зелёная зона не должна схлопнуться даже у самой сильной рыбы
    return Math.min(t.needBase + t.needPerPower * this.effectivePower(f), t.zoneTop - 0.1)
  }

  private counter(f: FightState): number {
    return clamp(1 - Math.abs(this.rodX + f.fishX) / this.tuning.counterTolerance, 0, 1)
  }

  private stepFight(dt: number) {
    const f = this.fightState!
    const t = this.tuning
    const power = this.effectivePower(f)

    // Смена поведения: спокойно → предупреждение → рывок в другую сторону → спокойно
    f.modeLeft -= dt
    if (f.modeLeft <= 0) {
      if (f.mode === 'calm') {
        f.mode = 'warn'
        f.modeLeft = t.rushWarn
      } else if (f.mode === 'warn') {
        f.mode = 'rush'
        f.modeLeft = randRange(this.rng, t.rushMin, t.rushMax)
        f.fishTargetX = -sideOf(f.fishX) * randRange(this.rng, 0.7, 1)
      } else {
        f.mode = 'calm'
        f.modeLeft = randRange(this.rng, t.calmMin, t.calmMax)
        f.sideLeft = randRange(this.rng, t.sideSwitchMin, t.sideSwitchMax)
      }
    }
    if (f.mode === 'calm') {
      f.sideLeft -= dt
      if (f.sideLeft <= 0) {
        f.fishTargetX = -sideOf(f.fishX) * randRange(this.rng, 0.4, 0.9)
        f.sideLeft = randRange(this.rng, t.sideSwitchMin, t.sideSwitchMax)
      }
    }
    const lateral = f.mode === 'rush' ? t.lateralSpeedRush : t.lateralSpeed
    f.fishX = moveTowards(f.fishX, f.fishTargetX, lateral * dt)

    // Усилие: палец поднимает, отпущенный палец опускает, рывок рыбы резко поднимает
    f.effort += (this.holding ? t.effortRise : -t.effortFall) * dt
    if (f.mode === 'rush') f.effort += power * t.rushGain * dt
    f.effort = Math.max(0, f.effort)

    const need = this.need(f)
    const inZone = f.effort >= need && f.effort < 1
    const counter = this.counter(f)

    // Подматываем, пока усилие в зелёной зоне; противодействие лишь немного ускоряет. Тяжёлую рыбу — медленнее.
    // На рывке сильная рыба утаскивает леску.
    const counterBoost = 1 - t.counterReelShare + t.counterReelShare * counter
    const reel = inZone ? (this.tackle.reelSpeed * counterBoost) / (1 + t.weightDrag * f.fish.weightKg) : 0
    const run = f.mode === 'rush' ? t.fishRunSpeed * power : 0
    f.distance += (run - reel) * dt

    f.breakTimer = f.effort >= 1 ? f.breakTimer + dt : Math.max(0, f.breakTimer - dt)
    f.slackTimer = f.effort < need ? f.slackTimer + dt : Math.max(0, f.slackTimer - dt)
    f.sideTimer = counter < t.counterMin ? f.sideTimer + dt : Math.max(0, f.sideTimer - dt)

    if (f.breakTimer >= this.breakGrace(f)) this.escape('lineBroke')
    else if (f.slackTimer >= t.slackGrace) this.escape('unhooked')
    else if (f.sideTimer >= t.sideGrace) this.escape('wrongSide')
    else if (f.distance >= t.lineLength) this.escape('lineOut')
    else if (f.distance <= 0) {
      f.distance = 0
      this.holding = false
      this.setPhase('caught')
      this.emit({ type: 'caught', fish: f.fish, price: fishPrice(f.fish) })
    }
  }

  private escape(reason: EscapeReason) {
    this.holding = false
    this.setPhase('escaped')
    this.emit({ type: 'escaped', reason, fish: this.hooked })
  }

  private setPhase(phase: Phase) {
    this._phase = phase
    this.phaseTime = 0
    this.emit({ type: 'phase', phase })
  }

  private emit(e: FishingEvent) {
    for (const l of this.listeners) l(e)
  }
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max)
}

function sideOf(x: number): number {
  return x < 0 ? -1 : 1
}

function moveTowards(from: number, to: number, maxStep: number): number {
  return Math.abs(to - from) <= maxStep ? to : from + Math.sign(to - from) * maxStep
}
