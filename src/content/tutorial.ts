import { DEFAULT_TUNING, type Phase, type Tuning } from '../core/FishingSession.ts'

// Обучение — на двух первых уловах: по шагу на каждую механику. Ничего не знает ни о графике, ни об HTML —
// только какой шаг сейчас и когда переходить к следующему. Сцена сообщает о событиях игры и рисует шаг.
// Первый вылов — всё, кроме рывка: рыба не рвёт. Второй игрок ловит сам, подсказка — только про рывок.

export type TutorialStepId =
  | 'zones'
  | 'cast'
  | 'wait'
  | 'bite'
  | 'tension'
  | 'tensionHold'
  | 'slider'
  | 'rush'
  | 'escaped'
  | 'silver'
  | 'xp'

/** Что подсветить на экране. null — ничего: карточка посередине. */
export type TutorialTarget = 'water' | 'nearZone' | 'float' | 'effortBar' | 'rodStrip' | 'silver' | 'xp' | null

export interface TutorialStep {
  id: TutorialStepId
  target: TutorialTarget
  /** Игра стоит, пока шаг на экране. */
  freeze: boolean
  /** Шаг закрывается тапом по экрану. Иначе тап уходит в игру — шаг ждёт действия игрока (заброс, подсечку). */
  tapToContinue: boolean
}

const STEPS: Record<TutorialStepId, TutorialStep> = {
  zones: { id: 'zones', target: 'water', freeze: true, tapToContinue: true },
  cast: { id: 'cast', target: 'nearZone', freeze: false, tapToContinue: false },
  wait: { id: 'wait', target: 'float', freeze: true, tapToContinue: true },
  bite: { id: 'bite', target: 'float', freeze: true, tapToContinue: false },
  tension: { id: 'tension', target: 'effortBar', freeze: true, tapToContinue: true },
  tensionHold: { id: 'tensionHold', target: 'effortBar', freeze: true, tapToContinue: true },
  slider: { id: 'slider', target: 'rodStrip', freeze: true, tapToContinue: true },
  rush: { id: 'rush', target: 'effortBar', freeze: true, tapToContinue: true },
  escaped: { id: 'escaped', target: null, freeze: true, tapToContinue: true },
  silver: { id: 'silver', target: 'silver', freeze: true, tapToContinue: true },
  xp: { id: 'xp', target: 'xp', freeze: true, tapToContinue: true },
}

/** Что идёт следом за шагом, закрытым тапом. null — шаг просто гаснет, игра продолжается. */
const AFTER: Partial<Record<TutorialStepId, TutorialStepId>> = {
  zones: 'cast',
  tension: 'tensionHold',
  tensionHold: 'slider',
  escaped: 'cast',
  silver: 'xp',
}

/**
 * Пока идёт обучение, рыбалка мягче: поклёвка быстрее, рывок наступает вскоре после начала боя,
 * а на ошибку больше запаса — рыба должна попасться, даже если игрок ещё путается.
 */
export const TUTORIAL_TUNING: Tuning = {
  ...DEFAULT_TUNING,
  biteDelayMin: 2,
  biteDelayMax: 3,
  calmMin: 2,
  calmMax: 2.5,
  slackGrace: 5,
  sideGrace: 4,
  breakGraceWeakBonus: 3,
}

/** Первый вылов: всё то же, но рыба не рвёт — новичку и без рывка есть что освоить. */
export const FIRST_CATCH_TUNING: Tuning = { ...TUTORIAL_TUNING, rushes: false }

/** Размер рыбы в обучении (0..1): покрупнее средней — рывок заметен, а улов радует. */
export const TUTORIAL_FISH_SIZE = 0.8

export class Tutorial {
  /** Который вылов идёт: 1 — с объяснениями, 2 — сам, с подсказкой про рывок. */
  private _catch: 1 | 2
  private _step: TutorialStep | null
  private _done = false
  /** Объяснения механик показываем по разу: после схода игрок ловит снова, но без повторов. */
  private readonly shown = new Set<TutorialStepId>(['zones'])

  /** secondCatch — первую рыбу игрок уже поймал (и перезашёл): начинаем со второго вылова. */
  constructor(secondCatch = false) {
    this._catch = secondCatch ? 2 : 1
    this._step = secondCatch ? null : STEPS.zones
  }

  get step(): TutorialStep | null {
    return this._step
  }

  get done(): boolean {
    return this._done
  }

  /** Игра стоит. */
  get frozen(): boolean {
    return !!this._step?.freeze
  }

  /** Настройки рыбалки на этом этапе. Сцена меняет их между забросами. */
  get tuning(): Tuning {
    if (this._done) return DEFAULT_TUNING
    return this._catch === 1 ? FIRST_CATCH_TUNING : TUTORIAL_TUNING
  }

  /** Игрок тапнул по карточке шага. Возвращает закрытый шаг — сцене бывает нужно что-то сделать вслед. */
  next(): TutorialStepId | null {
    const step = this._step
    if (!step?.tapToContinue) return null
    const after = AFTER[step.id]
    this._step = after ? STEPS[after] : null
    if (after) this.shown.add(after)
    return step.id
  }

  /** Сменилась фаза рыбалки. */
  onPhase(phase: Phase): void {
    if (this._done) return
    // Второй вылов игрок ведёт сам: сорвалась — обычный экран итога, поймал — обучение пройдено
    if (this._catch === 2) {
      if (phase === 'caught') {
        this._done = true
        this._step = null
      }
      return
    }
    switch (phase) {
      case 'casting':
        if (this._step?.id === 'cast') this._step = null
        break
      case 'waiting':
        this.showOnce('wait')
        break
      case 'bite':
        // Каждый раз, пока первая рыба не поймана: после схода новичок легко прозевает поклёвку снова
        this.show('bite')
        break
      case 'fighting':
        if (this._step?.id === 'bite') this._step = null
        this.showOnce('tension')
        break
      case 'escaped':
        this.show('escaped')
        break
      case 'caught':
        this._catch = 2
        this.show('silver')
        break
    }
  }

  /** Рыба вот-вот рванёт — в бою появилось предупреждение. Рывки — только во втором вылове. */
  onRushWarning(): void {
    if (this._catch === 2 && !this._done && !this._step) this.showOnce('rush')
  }

  private showOnce(id: TutorialStepId) {
    if (this.shown.has(id)) return
    this.show(id)
  }

  private show(id: TutorialStepId) {
    this.shown.add(id)
    this._step = STEPS[id]
  }
}
